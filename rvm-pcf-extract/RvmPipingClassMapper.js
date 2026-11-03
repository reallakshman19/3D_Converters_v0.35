/**
 * RvmPipingClassMapper.js
 * Wave 5 – maps piping class from direct attributes, linelist master,
 * pipeline ref token parsing, or piping class master lookup.
 * Pure JS: no DOM, no three.js.
 */

const DIRECT_KEYS = ['PIPING_CLASS', 'CLASS', 'SPEC', 'PSPEC', 'PIPING_SPEC', 'SPECIFICATION'];

const PIPELINE_REF_PATTERNS = [
  { re: /CS(\d+)/,           action: (m, r) => { r.material = 'CS'; r.rating = m[1]; } },
  { re: /SS(\d+)/,           action: (m, r) => { r.material = 'SS'; r.rating = m[1]; } },
  { re: /[A-Z]\d[A-Z]/,     action: (m, r) => { r.pipingClass = m[0]; } },
  { re: /(\d+)#/,            action: (m, r) => { r.rating = m[1]; } },
];

const EMPTY_RESULT = () => ({
  pipingClass:         null,
  rating:              null,
  material:            null,
  schedule:            null,
  wallThickness:       null,
  corrosionAllowance:  null,
  endCondition:        null,
  facing:              null,
  classMatchScore:     0,
  classMappingSource:  null,
  classMappingRuleId:  null,
  pipingClassMapping:  null,
});

export class RvmPipingClassMapper {
  constructor(masters = {}) {
    this._linelist          = masters.linelist          || [];
    this._pipingClassMaster = masters.pipingClassMaster || [];
    
    // Configurable Rating extraction (Nth regex)
    this._patterns = [...PIPELINE_REF_PATTERNS];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const ratingRegexStr = localStorage.getItem('rvm_pcf_rating_regex');
        const ratingGroupStr = localStorage.getItem('rvm_pcf_rating_group');
        if (ratingRegexStr) {
           const customRe = new RegExp(ratingRegexStr, 'i');
           const groupIdx = parseInt(ratingGroupStr || '1', 10);
           this._patterns.unshift({ re: customRe, action: (m, r) => { r.rating = m[groupIdx]; } });
        }
      }
    } catch (e) {
      console.warn('Failed to parse custom rating regex', e);
    }
  }

  mapRow(row) {
    const result = EMPTY_RESULT();
    const attrs  = row.attributes || {};
    const textSources = [
      row.pipelineRef,
      attrs.DTXR,
      attrs.SPRE,
      attrs.LSTU,
      attrs.NAME,
      attrs.SKEY,
    ].filter(value => value != null && String(value).trim() !== '');

    // ── Priority 1: Direct attribute ──────────────────────────────────────────
    const attrUpper = Object.fromEntries(
      Object.entries(attrs).map(([k, v]) => [k.toUpperCase().trim(), v])
    );
    for (const key of DIRECT_KEYS) {
      if (key in attrUpper && attrUpper[key] != null && attrUpper[key] !== '') {
        result.pipingClass        = String(attrUpper[key]);
        result.classMappingSource = 'DIRECT';
        result.classMappingRuleId = `DIRECT:${key}`;
        return result;
      }
    }

    // Priority 1b: Free-text parse from common source fields
    for (const text of textSources) {
      const textNorm = String(text).toUpperCase();
      let textFound = false;

      for (const { re, action } of this._patterns) {
        const m = textNorm.match(re);
        if (m) {
          action(m, result);
          textFound = true;
        }
      }

      if (textFound && result.classMappingSource == null) {
        result.classMappingSource = 'TEXT-PARSE';
        result.classMappingRuleId = `TEXT-PARSE:${String(text).slice(0, 80)}`;
      }

      if (result.pipingClass != null && result.rating != null) {
        break;
      }
    }
    // ── Priority 2: Linelist master lookup ────────────────────────────────────
    const ref = row.pipelineRef || null;
    if (ref && this._linelist.length > 0) {
      const match = this._linelist.find(
        m => m.pipelineRef === ref || m.lineNo === ref
      );
      if (match) {
        result.pipingClass        = match.pipingClass        ?? null;
        result.rating             = match.rating             ?? null;
        result.material           = match.material           ?? null;
        result.schedule           = match.schedule           ?? null;
        result.wallThickness      = match.wallThickness      ?? null;
        result.corrosionAllowance = match.corrosionAllowance ?? null;
        result.endCondition       = match.endCondition       ?? null;
        result.facing             = match.facing             ?? null;
        result.classMappingSource = 'LINELIST';
        result.classMappingRuleId = `LINELIST:${match.pipelineRef || match.lineNo}`;
        result.pipingClassMapping = match;
        return result;
      }
    }

    // ── Priority 3: Parse from Pipeline Ref ───────────────────────────────────
    if (ref) {
      let anyFound = false;
      for (const { re, action } of this._patterns) {
        const m = ref.match(re);
        if (m) {
          action(m, result);
          anyFound = true;
        }
      }
      if (anyFound) {
        result.classMappingSource = 'PIPELINE-REF-PARSE';
        result.classMappingRuleId = `PIPELINE-REF-PARSE:${ref}`;
        // Don't return early — continue to class master to enrich, but keep source
        // Actually per spec: use source = PIPELINE-REF-PARSE if something found here.
        // Class master runs next only if we still don't have a pipingClass.
        if (result.pipingClass) return result;
        // Fall through to class master to see if we can get pipingClass
        // but remember we already set partial fields
      }
    }

    // ── Priority 4: Piping Class Master ───────────────────────────────────────
    if (this._pipingClassMaster.length > 0) {
      let bestScore  = -Infinity;
      let bestMaster = null;

      const rowClass = result.pipingClass || null; // from parse step
      const rowBore  = row.convertedBore  || null;
      const rowType  = (row.type          || '').toUpperCase();
      const rowRating = result.rating     || null;
      const rowMat   = result.material    || null;
      const rowEnd   = result.endCondition|| null;

      for (const master of this._pipingClassMaster) {
        let score = 0;

        const mClass = master.pipingClass    || null;
        const mBore  = master.convertedBore  || null;
        const mType  = (master.componentType || '').toUpperCase();
        const mRating = master.rating        || null;
        const mMat   = master.material       || null;
        const mEnd   = master.endCondition   || null;

        // pipingClass scoring
        if (rowClass && mClass) {
          if (rowClass === mClass) score += 40;
          else                    score -= 50;
        }

        // bore scoring
        if (rowBore && mBore) {
          if (String(rowBore) === String(mBore)) score += 30;
          else                                    score -= 30;
        }

        // component type scoring
        if (mType === '*') {
          score += 5;
        } else if (rowType && mType) {
          if (rowType === mType) score += 20;
          else                   score -= 10;
        }

        // rating
        if (rowRating && mRating) {
          if (String(rowRating) === String(mRating)) score += 15;
          else                                        score -= 10;
        }

        // material
        if (rowMat && mMat) {
          if (rowMat === mMat) score += 10;
        }

        // end condition
        if (rowEnd && mEnd) {
          if (rowEnd === mEnd) score += 10;
        }

        if (score > bestScore) {
          bestScore  = score;
          bestMaster = master;
        }
      }

      if (bestScore >= 70) {
        _applyMaster(result, bestMaster, bestScore, 'CLASS-MASTER-AUTO');
        return result;
      } else if (bestScore >= 50) {
        _applyMaster(result, bestMaster, bestScore, 'CLASS-MASTER-WARNING');
        return result;
      }
      // < 50: do not apply; leave result as-is from parse step (or all null)
    }

    return result;
  }
}

function _applyMaster(result, master, score, source) {
  result.classMatchScore     = score;
  result.classMappingSource  = source;
  result.classMappingRuleId  = `${source}:${master.pipingClass || '?'}`;
  result.pipingClassMapping  = master;

  // Fill fields from master only where still null
  if (result.pipingClass        == null) result.pipingClass        = master.pipingClass        ?? null;
  if (result.rating             == null) result.rating             = master.rating             ?? null;
  if (result.material           == null) result.material           = master.material           ?? null;
  if (result.schedule           == null) result.schedule           = master.schedule           ?? null;
  if (result.wallThickness      == null) result.wallThickness      = master.wallThickness      ?? null;
  if (result.corrosionAllowance == null) result.corrosionAllowance = master.corrosionAllowance ?? null;
  if (result.endCondition       == null) result.endCondition       = master.endCondition       ?? null;
  if (result.facing             == null) result.facing             = master.facing             ?? null;
}
