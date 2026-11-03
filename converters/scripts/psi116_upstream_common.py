#!/usr/bin/env python3
from __future__ import annotations

from collections import Counter
import json, math, re, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

PSI116_NS = 'http://aveva.com/pipestress116.xsd'
SPECIAL_TYPES = {'ELBO', 'TEE', 'OLET', 'REDU', 'ATTA'}
RIGID_TYPES = {'VALV', 'FLAN', 'GASK'}
BORE_KEYS = ('HBOR', 'TBOR', 'ABORE', 'LBORE', 'BORE', 'NBORE', 'DBOR')
POINT_KEYS = ('POS', 'POSITION', 'COORDS', 'CO_ORDS', 'CO_ORD', 'POSS')
APOS_KEYS = ('APOS', 'A_POS', 'EP1', 'END1', 'START', 'START_POINT', 'POS_START')
LPOS_KEYS = ('LPOS', 'L_POS', 'EP2', 'END2', 'END', 'END_POINT', 'POS_END')
CPOS_KEYS = ('CPOS', 'CP', 'CENTER', 'CENTRE', 'CENTER_POINT', 'CENTRE_POINT')
BPOS_KEYS = ('BPOS', 'BP', 'BRANCH_POINT', 'BPOS1', 'TEE_POINT')
SUPPORT_KEYS = ('SUPPORTCOORD', 'SUPPORT_COORD', 'SCOORD', 'SUPPORT_POS', 'SUPPORTPOS') + POINT_KEYS + BPOS_KEYS + APOS_KEYS + LPOS_KEYS
SUPPORT_TAG_RX = re.compile(r'\bPS[-_\s]?[A-Z0-9][A-Z0-9._/\-]*\b', re.I)
SUPPORT_TEXT_RX = re.compile(r'\b(GUIDE|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|RESTING|REST|SHOE|BP|BASE\s*PLATE|ANCHOR|FIXED|STOPPER|STOP)\b', re.I)
SIGNED_AXIS_RX = re.compile(r'([+-]?)\s*([XYZ])\b', re.I)
KV_RX = re.compile(r'^\s*:?(?P<key>[A-Za-z][A-Za-z0-9_\-]*)\s*(?::=|=|:)\s*(?P<value>.*?)\s*$')
TYPE_RULES = (
    (re.compile(r'WELDOLET|SOCKOLET|THREDOLET|SWEEPOLET|\bOLET\b', re.I), 'OLET'),
    (re.compile(r'\bVALV(E)?\b', re.I), 'VALV'),
    (re.compile(r'\bFLAN(GE)?\b', re.I), 'FLAN'),
    (re.compile(r'\bGASK(ET)?\b', re.I), 'GASK'),
    (re.compile(r'\b(ELBO(W)?|BEND)\b', re.I), 'ELBO'),
    (re.compile(r'\bTEE\b', re.I), 'TEE'),
    (re.compile(r'\bREDU(CER)?\b', re.I), 'REDU'),
    (re.compile(r'\b(ATTA|ANCI|SUPP|SUPPORT|REST|GUIDE|LINE\s*STOP|LINESTOP|LIMIT|ANCHOR|FIXED|SHOE|BP|BASE\s*PLATE)\b', re.I), 'ATTA'),
    (re.compile(r'\b(PIPE|TUBI|BRAN)\b', re.I), 'PIPE'),
)


def clean(v): return '' if v is None else str(v).strip()
def x(v): return escape('' if v is None else str(v), {'"': '&quot;'})
def finite(v, default=0.0):
    try:
        n = float(v); return n if math.isfinite(n) else default
    except Exception: return default
def nfmt(v, dec=3):
    s = f'{finite(v):.{dec}f}'.rstrip('0').rstrip('.')
    return s or '0'
def ifmt(v): return str(int(round(finite(v, 0))))
def mm(v):
    m = re.search(r'-?\d+(?:\.\d+)?', clean(v).replace('mm', ' ').replace('MM', ' '))
    return float(m.group(0)) if m else None

def pt(v):
    if v in (None, ''): return None
    if isinstance(v, (list, tuple)) and len(v) >= 3:
        p = tuple(finite(v[i], float('nan')) for i in range(3))
        return p if all(math.isfinite(c) for c in p) else None
    if isinstance(v, dict):
        p = (finite(v.get('x', v.get('X')), float('nan')), finite(v.get('y', v.get('Y')), float('nan')), finite(v.get('z', v.get('Z')), float('nan')))
        return p if all(math.isfinite(c) for c in p) else None
    raw = clean(v); tokens = raw.split(); out = {'x':0.0,'y':0.0,'z':0.0}; directional = False
    for i in range(0, max(len(tokens) - 1, 0), 2):
        axis = tokens[i].upper(); val = mm(tokens[i + 1])
        if val is None: continue
        if axis == 'E': out['x'] = val; directional = True
        elif axis == 'W': out['x'] = -val; directional = True
        elif axis == 'N': out['y'] = val; directional = True
        elif axis == 'S': out['y'] = -val; directional = True
        elif axis == 'U': out['z'] = val; directional = True
        elif axis == 'D': out['z'] = -val; directional = True
    if directional: return (out['x'], out['y'], out['z'])
    vals = [float(q) for q in re.findall(r'-?\d+(?:\.\d+)?', raw)]
    return tuple(vals[:3]) if len(vals) >= 3 else None

def getp(a, keys):
    for k in keys:
        p = pt(a.get(k))
        if p: return p
    return None

def vsub(a,b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def vadd(a,b): return (a[0]+b[0], a[1]+b[1], a[2]+b[2])
def vmul(a,s): return (a[0]*s, a[1]*s, a[2]*s)
def vlen(a): return math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])
def unit(a):
    l = vlen(a); return (1.0,0.0,0.0) if l <= 1e-9 else (a[0]/l,a[1]/l,a[2]/l)

def attrs_from_obj(obj):
    out = {}
    if isinstance(obj, dict):
        for k in ('attributes','attrs','attr','rawAttributes','raw_attributes','normalized'):
            if isinstance(obj.get(k), dict): out.update(obj[k])
        for k,v in obj.items():
            if k not in {'children','items','branches','attributes','attrs','attr','rawAttributes','raw_attributes','normalized'} and isinstance(v,(str,int,float,bool,list,tuple,dict)):
                out.setdefault(k, v)
        for src, dst in (('type','TYPE'),('kind','KIND'),('name','NAME'),('path','PATH'),('id','ID')):
            if obj.get(src): out.setdefault(dst, obj.get(src))
    return out

def blob(a): return ' '.join(clean(v) for v in a.values() if clean(v))
def support_kind(a):
    s = blob(a).upper()
    if re.search(r'\bLINE\s*STOP\b|\bLINESTOP\b|\bSTOPPER\b|\bSTOP\b', s): return 'LINESTOP'
    if re.search(r'\bLIMIT\s*STOP\b|\bLIMIT\b', s): return 'LIMIT'
    if re.search(r'\bGUIDE\b', s): return 'GUIDE'
    if re.search(r'\bRESTING\b|\bREST\b|\bSHOE\b|\bBP\b|\bBASE\s*PLATE\b', s): return 'REST'
    if re.search(r'\bANCHOR\b|\bFIXED\b', s): return 'ANCHOR'
    return ''
def comp_type(a):
    if support_kind(a): return 'ATTA'
    s = blob(a)
    for rx, typ in TYPE_RULES:
        if rx.search(s): return typ
    return 'UNKNOWN'
def bore(a, default):
    for k in BORE_KEYS:
        b = mm(a.get(k))
        if b and b > 0: return b
    dtxr = a.get('DTXR')
    if dtxr is not None and not SUPPORT_TEXT_RX.search(clean(dtxr)):
        b = mm(dtxr)
        if b and b > 0: return b
    return default

def tag(a):
    for k in ('SUPPORT_TAG','CMPSUPREFN','NAME','TAG','TAGNO','ITEMCODE','PARTNO','REF','REFNO','DBREF','COMPONENTREFNO','CA97','CA98','SKEY','SPRE','DESCRIPTION','DESC','__NEW__','__RAW__','ID'):
        m = SUPPORT_TAG_RX.search(clean(a.get(k)))
        if m: return re.sub(r'\s+', '-', m.group(0).strip())
    for k in ('CMPSUPREFN','SUPPORT_TAG','NAME','TAG','TAGNO','COMPONENTREFNO','REFNO','REF','ID'):
        if clean(a.get(k)): return clean(a.get(k))
    return ''
def axis_name(v):
    s = clean(v).upper()
    if s in ('+X','-X','X','+Y','-Y','Y','+Z','-Z','Z'): return s
    m = SIGNED_AXIS_RX.search(s)
    return f'{m.group(1)}{m.group(2).upper()}' if m else ''
def axis_unsigned(v): return axis_name(v).replace('+','').replace('-','')
def dominant_axis(a,b):
    if not a or not b: return ''
    d = [abs(b[i]-a[i]) for i in range(3)]
    return ('X','Y','Z')[d.index(max(d))] if max(d) > 1e-9 else ''
def single_guide_axis(axial, vertical):
    t = [a for a in ('X','Y','Z') if a != axial]
    nv = [a for a in t if a != vertical]
    return (nv or t or ['Y'])[0]

class Context:
    def __init__(self, opt):
        self.opt = opt
        self.node = max(1, int(finite(getattr(opt,'node_start',10),10)))
        self.step = max(1, int(finite(getattr(opt,'node_step',10),10)))
        self.default_diameter = max(0.001, finite(getattr(opt,'default_diameter',100),100))
        self.default_wall = max(0.0, finite(getattr(opt,'default_wall_thickness',0.01),0.01))
        self.default_corr = max(0.0, finite(getattr(opt,'default_corrosion_allowance',0),0))
        self.default_insu = max(0.0, finite(getattr(opt,'default_insulation_thickness',0),0))
        self.ref_counter = 1
    def next(self):
        n = self.node; self.node += self.step; return n
    def ref(self):
        r = f'AUTO-{self.ref_counter}'; self.ref_counter += 1; return r

def cref(a,ctx):
    t = tag(a)
    if t: return t
    for k in ('COMPONENTREFNO','REFNO','REF','DBREF','CA97','CA98','ID'):
        if clean(a.get(k)): return clean(a.get(k))
    return ctx.ref()
def nname(a,typ,suffix=''):
    if typ == 'ATTA' and tag(a): return tag(a)+suffix
    for k in ('NAME','TAG','TAGNO','ITEMCODE','PARTNO','__NEW__','ID'):
        if clean(a.get(k)): return clean(a.get(k))+suffix
    return suffix.strip('-') or typ

def points(a):
    return {'apos':getp(a,APOS_KEYS),'lpos':getp(a,LPOS_KEYS),'pos':getp(a,POINT_KEYS),'cpos':getp(a,CPOS_KEYS),'bpos':getp(a,BPOS_KEYS),'support':getp(a,SUPPORT_KEYS)}
def center_for(typ,p):
    if typ == 'ATTA': return p.get('support') or p.get('pos') or p.get('bpos') or p.get('apos') or p.get('lpos')
    if typ == 'ELBO': return p.get('cpos') or p.get('pos') or p.get('apos') or p.get('lpos')
    if typ in {'TEE','OLET'}: return p.get('pos') or p.get('cpos') or p.get('bpos') or p.get('apos') or p.get('lpos')
    return p.get('pos') or p.get('cpos') or p.get('support') or p.get('apos') or p.get('lpos') or p.get('bpos')
def bend_radius(a,p):
    r = mm(a.get('BENDRADIUS') or a.get('BEND_RADIUS') or a.get('BRAD') or a.get('RADI') or a.get('RADIUS'))
    if r and r > 0: return r
    c = p.get('cpos') or p.get('pos')
    if c and p.get('apos') and p.get('lpos'): return min(vlen(vsub(c,p['apos'])), vlen(vsub(c,p['lpos'])))
    return 0.0
def reducer_angle(a): return mm(a.get('ALPHAANGLE') or a.get('ALPHA_ANGLE') or a.get('ANGLE') or a.get('REDUCERANGLE')) or 1.0

def restraint(a,ep1,ep2,opt):
    k = support_kind(a)
    if not k: return []
    axial = dominant_axis(ep1,ep2) or axis_unsigned(getattr(opt,'support_pipe_axis','X')) or 'X'
    vertical = axis_unsigned(getattr(opt,'vertical_axis','Y')) or 'Y'
    if k == 'GUIDE': typ = single_guide_axis(axial,vertical); gap = clean(getattr(opt,'guide_gap','')) or clean(getattr(opt,'support_gap',''))
    elif k == 'LINESTOP': typ = axis_name(getattr(opt,'line_stop_direction','')) or axial; gap = clean(getattr(opt,'line_stop_gap','')) or clean(getattr(opt,'support_gap',''))
    elif k == 'LIMIT': typ = axis_name(getattr(opt,'limit_direction','')) or axial; gap = clean(getattr(opt,'limit_gap','')) or clean(getattr(opt,'support_gap',''))
    elif k == 'REST': typ = axis_name(getattr(opt,'rest_direction','')) or vertical; gap = clean(getattr(opt,'rest_gap','')) or clean(getattr(opt,'support_gap',''))
    else: typ = 'A'; gap = clean(getattr(opt,'anchor_gap','')) or clean(getattr(opt,'support_gap',''))
    return [{'type':typ,'stiffness':clean(getattr(opt,'support_stiffness','')),'gap':gap,'friction':clean(getattr(opt,'support_friction','0.3'))}]

def make_node(a,ctx,typ,pos,endpoint=0,ref=None,rigid=None,alpha=None,br=0.0,bt=None,rests=None,suffix=''):
    return {'number':ctx.next(),'name':nname(a,typ,suffix),'endpoint':endpoint,'rigid':rigid,'ctype':typ,'weight':finite(a.get('WEIG') or a.get('WEIGHT'),0),'ref':ref or cref(a,ctx),'conn':support_kind(a) if typ=='ATTA' else clean(a.get('CONNECTIONTYPE') or a.get('CONN') or a.get('CONNECTION') or a.get('CREF') or a.get('CTYP')),'od':bore(a,ctx.default_diameter),'wall':mm(a.get('WTHK') or a.get('WALLTHK') or a.get('WALL_THICKNESS')) or ctx.default_wall,'corr':mm(a.get('CORA') or a.get('CORROSIONALLOWANCE')) or ctx.default_corr,'alpha':alpha,'insu':mm(a.get('INSU') or a.get('INSULATIONTHICKNESS')) or ctx.default_insu,'pos':pos,'br':br,'bt':bt,'sif':ifmt(a.get('SIF')),'restraints':rests or []}
def guard(a,ctx,pos,ref,suffix): return make_node(a,ctx,'PIPE',pos,0,ref=ref,suffix=suffix)

def materialize(obj,ctx):
    a = attrs_from_obj(obj); typ = comp_type(a)
    if typ == 'UNKNOWN': return []
    p = points(a); center = center_for(typ,p)
    if center is None: return []
    ep1 = p.get('apos') or p.get('pos') or center
    ep2 = p.get('lpos') or p.get('bpos') or p.get('pos') or center
    direction = unit(vsub(ep2,ep1)); gap = max(bore(a,ctx.default_diameter),1.0)
    before = ep1 if vlen(vsub(ep1,center)) > 1e-9 else vadd(center,vmul(direction,-gap))
    after = ep2 if vlen(vsub(ep2,center)) > 1e-9 else vadd(center,vmul(direction,gap))
    ref = cref(a,ctx)
    if typ in SPECIAL_TYPES:
        if typ == 'ELBO': mid = make_node(a,ctx,typ,center,0,ref=ref,br=bend_radius(a,p),bt=1)
        elif typ in {'TEE','OLET'}: mid = make_node(a,ctx,typ,center,0,ref=ref)
        elif typ == 'REDU': mid = make_node(a,ctx,typ,center,0,ref=ref,alpha=reducer_angle(a))
        else: mid = make_node(a,ctx,typ,center,0,ref=ref,rests=restraint(a,ep1,ep2,ctx.opt))
        return [guard(a,ctx,before,ref,'-UP'), mid, guard(a,ctx,after,ref,'-DN')]
    if typ in RIGID_TYPES:
        return [guard(a,ctx,before,ref,'-UP'), make_node(a,ctx,typ,center,0,ref=ref,rigid=2), guard(a,ctx,after,ref,'-DN')]
    if p.get('apos') and p.get('lpos'):
        return [make_node(a,ctx,'PIPE',p['apos'],0,ref=ref), make_node(a,ctx,'PIPE',p['lpos'],0,ref=ref)]
    return [make_node(a,ctx,'PIPE' if typ=='PIPE' else typ,center,0,ref=ref)]

def node_xml(n):
    p = n['pos']
    lines = ['      <Node>', f"        <NodeNumber>{n['number']}</NodeNumber>", f"        <NodeName>{x(n['name'])}</NodeName>", f"        <Endpoint>{ifmt(n['endpoint'])}</Endpoint>"]
    if n.get('rigid') is not None: lines.append(f"        <Rigid>{ifmt(n['rigid'])}</Rigid>")
    lines += [f"        <ComponentType>{x(n['ctype'])}</ComponentType>", f"        <Weight>{nfmt(n['weight'])}</Weight>", f"        <ComponentRefNo>{x(n['ref'])}</ComponentRefNo>", f"        <ConnectionType>{x(n['conn'])}</ConnectionType>", f"        <OutsideDiameter>{nfmt(n['od'])}</OutsideDiameter>", f"        <WallThickness>{nfmt(n['wall'])}</WallThickness>", f"        <CorrosionAllowance>{nfmt(n['corr'])}</CorrosionAllowance>"]
    if n.get('alpha') is not None: lines.append(f"        <AlphaAngle>{nfmt(n['alpha'])}</AlphaAngle>")
    lines += [f"        <InsulationThickness>{nfmt(n['insu'])}</InsulationThickness>", f"        <Position>{p[0]:.2f} {p[1]:.2f} {p[2]:.2f}</Position>", f"        <BendRadius>{nfmt(n['br'])}</BendRadius>"]
    if n.get('bt') is not None: lines.append(f"        <BendType>{ifmt(n['bt'])}</BendType>")
    lines.append(f"        <SIF>{ifmt(n['sif'])}</SIF>")
    for r in n.get('restraints') or []:
        lines += ['        <Restraint>', f"          <Type>{x(r.get('type',''))}</Type>", f"          <Stiffness>{x(r.get('stiffness',''))}</Stiffness>", f"          <Gap>{x(r.get('gap',''))}</Gap>", f"          <Friction>{x(r.get('friction',''))}</Friction>", '        </Restraint>']
        break
    lines.append('      </Node>')
    return '\n'.join(lines)

def write_xml(project, branch_records, output_path:Path, opt, label):
    ctx = Context(opt)
    lines = ['<?xml version="1.0" encoding="utf-8"?>', f'<PipeStressExport xmlns="{PSI116_NS}">', '  <DateTime></DateTime>', f'  <Source>{x(getattr(opt,"source","AVEVA PSI"))}</Source>', '  <Version>0.0.0.0</Version>', '  <UserName>browser-runtime</UserName>', f'  <Purpose>{x(getattr(opt,"purpose","RMSS conversion"))}</Purpose>', f'  <ProjectName>{x(project)}</ProjectName>', f'  <MDBName>/{x(project)}</MDBName>', f'  <TitleLine>{x(getattr(opt,"title_line","RMSS Output"))}</TitleLine>', '  <RestrainOpenEnds>No</RestrainOpenEnds>', '  <AmbientTemperature>0</AmbientTemperature>', '  <Pipe>', f'    <FullName>/{x(project)}</FullName>', '    <Ref></Ref>']
    count = skipped = restraints = 0; bytype = Counter()
    for name, records in branch_records:
        lines += ['    <Branch>', f'      <Branchname>{x(name)}</Branchname>', '      <Temperature>' + ''.join(f'<Temperature{i}>-100000</Temperature{i}>' for i in range(1,10)) + '</Temperature>', '      <Pressure>' + ''.join(f'<Pressure{i}>0</Pressure{i}>' for i in range(1,10)) + '</Pressure>', '      <MaterialNumber>0</MaterialNumber>', '      <InsulationDensity>0</InsulationDensity>', '      <FluidDensity>0</FluidDensity>']
        for rec in records:
            nodes = materialize(rec, ctx)
            if not nodes: skipped += 1; continue
            for node in nodes:
                lines.append(node_xml(node)); count += 1; bytype[node['ctype']] += 1
                if node.get('restraints'): restraints += 1
        lines.append('    </Branch>')
    lines += ['  </Pipe>', f'  <!-- {label} route-materialized XML generated {count} Node records; support restraints {restraints}; skipped {skipped}. Counts: {dict(bytype)} -->', '</PipeStressExport>']
    output_path.write_text('\n'.join(lines), encoding='utf-8')
    print(f"Wrote {output_path} with {count} XML nodes; support restraints {restraints}; preserved counts: {dict(bytype)}; skipped {skipped}.")

def parse_attribute_blocks(raw):
    blocks = []; cur = None
    for raw_line in raw.splitlines():
        line = raw_line.strip()
        if not line: continue
        if re.match(r'^NEW(\s|$)', line, re.I):
            if cur: blocks.append(cur)
            cur = {'__RAW__': raw_line, '__NEW__': line[3:].strip()}; continue
        if re.match(r'^END(\s|$)', line, re.I):
            if cur: blocks.append(cur); cur = None
            continue
        if cur is None: cur = {'__RAW__': ''}
        cur['__RAW__'] = f"{cur.get('__RAW__','')}\n{raw_line}".strip()
        m = KV_RX.match(line)
        if m: cur[m.group('key').upper().replace('-', '_')] = m.group('value').strip().strip('"')
    if cur: blocks.append(cur)
    return blocks

def read_attribute_text(path:Path):
    if path.suffix.lower() != '.zip': return path.read_text(encoding='utf-8', errors='replace')
    with zipfile.ZipFile(path, 'r') as zf:
        members = sorted(m for m in zf.namelist() if m.lower().endswith(('.att','.txt')))
        if not members: raise SystemExit(f'Attribute ZIP contains no .att/.txt file: {path}')
        return zf.read(members[0]).decode('utf-8', errors='replace')

def flatten_staged(obj):
    if isinstance(obj, dict):
        yield obj
        for k in ('children','items','branches'):
            if isinstance(obj.get(k), list):
                for ch in obj[k]: yield from flatten_staged(ch)
    elif isinstance(obj, list):
        for it in obj: yield from flatten_staged(it)

def staged_branch_records(data):
    roots = data if isinstance(data, list) else [data]
    out = []
    for i, root in enumerate(roots, 1):
        if not isinstance(root, dict): continue
        name = clean(root.get('name') or root.get('path') or root.get('id')) or f'B{i}'
        recs = [r for r in flatten_staged(root) if r is not root]
        if recs: out.append((name, recs))
    return out

def convert_staged_json(input_path:Path, output_path:Path, opt):
    data = json.loads(input_path.read_text(encoding='utf-8-sig'))
    records = staged_branch_records(data)
    if not records: raise SystemExit('Staged JSON has no branch children.')
    write_xml(input_path.stem, records, output_path, opt, 'StagedJSON')

def convert_attribute_txt(input_path:Path, output_path:Path, opt):
    blocks = parse_attribute_blocks(read_attribute_text(input_path))
    write_xml(input_path.stem, [(input_path.stem, blocks)], output_path, opt, 'Attribute TXT')
