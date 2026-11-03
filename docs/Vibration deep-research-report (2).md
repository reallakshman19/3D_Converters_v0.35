# API-First Piping Vibration Integrity Platform — Technical Research Report

## Executive conclusion and commercial benchmark

### Research conclusion

The correct product is **not a universal vibration calculator with a shared “risk score.”** It should be an engineering platform in which common physical data, workflow, evidence, project context, visualization, and execution infrastructure are shared, while **method applicability, empirical correlations, acceptance criteria, qualification status, and engineering authority remain mechanism-specific**.

That conclusion is consistent with the structure of the Energy Institute guidance itself. The current publicly listed process-pipework guideline remains the **second edition, January 2008**, while the EI subsea guideline explicitly separates flow-induced turbulence, flow-induced pressure pulsations, high-frequency acoustic excitation, surge/momentum changes, cavitation/flashing, vortex-induced vibration, mechanical excitation, and structural response into distinct technical topics. As of August 2026, a third edition of the process-pipework AVIFF guidance has been approved for publication and is being prepared by EI, but EI's public catalog still identifies the published process document as the 2008 second edition. This creates an immediate method-revision risk for any new implementation. citeturn16search0turn16search1turn16search9turn17view1

The first production vertical should therefore be **FIV in the sense of broadband flow-induced turbulence**, but internally it should be called **FIT**, not simply FIV. Current Wood material distinguishes “Flow-Induced Turbulence (FIT)” from a separate “Flow-Induced Vibration (FIV)” service, while an earlier Wood/BETA ASME paper uses FIV terminology for a dead-leg pulsation phenomenon now more clearly called flow-induced pulsation or periodic flow-induced excitation. Datacor similarly distinguishes FIV/FIT from FIP. This terminology collision is dangerous enough that it should be solved in the domain model before any equations are coded. citeturn19view2turn17view2turn19view0

**Recommended canonical identifiers:**

```text
VIB.FIT.FLOW_TURBULENCE
VIB.FIP.DEADLEG_PULSATION
VIB.AIV.HIGH_FREQUENCY_ACOUSTIC
VIB.SBC.STRUCTURAL_SUSCEPTIBILITY
VIB.CAV.CAVITATION
VIB.FLASH.FLASHING
VIB.SURGE.MOMENTUM_TRANSIENT
VIB.SLUG.MULTIPHASE_TRANSIENT
VIB.PULS.RECIPROCATING_MACHINERY
VIB.MECH.MECHANICAL_EXCITATION
VIB.VIV.VORTEX_SHEDDING
```

The user-facing product may say **“FIV — Flow-Induced Turbulence”** where industry familiarity requires it, but the calculation ID should remain unambiguous.

The central architectural rule should be:

> **Share infrastructure and physical data where definitions are identical; never share empirical engineering authority by default.**

That means the same density value may legitimately feed FIT, AIV, surge, and slug analyses, but an FIT correlation coefficient, AIV threshold, SBC geometry factor, fatigue criterion, or transient multiplier must never be silently inherited merely because another vibration mechanism happens to use a similarly named quantity.

### What Veridian demonstrates

**Vendor/product behavior — confirmed publicly.** Wood describes Veridian as an integrated suite comprising **Veridian VS** for screening, **Veridian AM** for anomaly management, and **Veridian iDAC** for data acquisition. VS is web based and intended to identify high-risk piping locations; AM tracks anomalies through mitigation and verification and can store measurement information; iDAC provides remote data acquisition, dashboards, and alerts. citeturn21search3turn21search0turn21search1

The strongest publicly evidenced Veridian workflow is:

```text
Piping/process data
        ↓
Qualitative screening
        ↓
Semi-quantitative mechanism assessment / LOF
        ↓
High-risk line or location identification
        ↓
Inspection / measurement / detailed analysis
        ↓
Anomaly
        ↓
Mitigation action
        ↓
Reassessment / verification
        ↓
Ongoing integrity record
```

Wood explicitly states that Veridian assesses risk in two stages—qualitative screening followed by semi-quantitative likelihood-of-failure assessment using the Energy Institute approach. It can assess anything from one line to a complete facility, accepts Excel line-list imports, and can quantify changed risk by changing process or piping data. citeturn20view0

The minimum generic quantitative data stated in the Veridian FAQ are unusually small: **pipe diameter, wall thickness, pipe span, mass flow rate, and fluid density**. Wood says these are commonly available from P&IDs, process flow diagrams, and heat-and-mass balances, with additional inputs required for particular mechanisms. citeturn17view0turn20view0

That minimum-data philosophy is a major product lesson: **the platform should ask for the least information required by the chosen method, not expose the union of every possible vibration input as one giant form.**

For support treatment, Wood states that for mechanisms including multiphase excitation and FIT, the maximum unsupported span is used in the screening representation. Structural natural frequency is therefore not inherently a mandatory input for every first-level screening calculation. Datacor's public FIT implementation independently makes the same distinction: span is a basic input; structural natural frequency is marked “advanced only.” citeturn20view0turn19view0

Veridian VS does not, according to Wood's FAQ, ingest field measurements directly; AM does. The FAQ also says interfaces to HYSYS, SmartPlant, smart P&IDs, and piping isometrics were being considered. Therefore a sophisticated automatic 3D/process integration workflow should **not** be attributed to Veridian from the current public evidence. citeturn20view0

**Public evidence insufficient — inference follows.** Public pages establish projects/databases, line-list import, facility screening, mechanism calculations, anomaly management, measurement storage, and changed-condition reassessment, but they do not document enough screen-by-screen behavior to confirm exactly how project creation, line navigation, scenario comparison, mitigation dialogs, heatmaps, or drill-down calculation screens operate. Those should be treated as benchmark-inspired UX requirements, not copied or represented as known Veridian internals.

The public Veridian model nevertheless establishes an important quality benchmark: it is not just a calculator. Wood presents screening, targeted measurement, anomaly management, remedial action, changed operating scenarios, and detailed analysis as an integrated integrity-management workflow. citeturn21search3turn21search6

The Oman LNG case study provides a particularly useful facility-scale benchmark: Wood reports screening more than 2,000 flowlines, identifying hundreds of concerns for further attention, following high-risk findings with field inspection and measurements, tracking anomalies, and using detailed numerical/field assessment for difficult cases. That is the scale and lifecycle pattern a competitive platform should target rather than optimizing only for individual calculator execution. citeturn2view1

### The seven concepts that must remain distinct

| Concept | Meaning in the proposed platform | Must not be confused with |
|---|---|---|
| **Engineering calculation** | Deterministic transformation of validated inputs and pinned master data into mechanism-specific outputs/intermediates. | Whether the method applies or whether the result is acceptable. |
| **Applicability determination** | Explicit rules establishing that the chosen correlation/method is valid for phase, geometry, operating regime, material, configuration, etc. | Input validation. A valid number can still be outside method scope. |
| **Acceptance / screening assessment** | Comparison of calculation output against a particular method revision's screening criteria/action bands. | Probability of actual failure or design-code compliance. |
| **Engineering authority** | Organizational permission to use a method/result for screening, design decisions, sign-off, or operation. | Software implementation status. |
| **Visualization** | Display of calculations/findings on tables, dashboards, P&IDs, or 3D geometry. | Engineering validation of the underlying geometry or result. |
| **Workflow orchestration** | Project/case execution, batching, findings, assignments, mitigation, verification, approvals, audit. | Calculation physics. |
| **RCA reasoning** | Combining excitation hypotheses, measured signatures, modes, structural observations, and operating context to rank causes. | Screening LOF. |

The Energy Institute's own separation of excitation mechanisms, detailed fatigue assessment, monitoring, verification, and management of change strongly supports this decomposition. citeturn17view1turn18view2

### Competitive gap analysis

“Not publicly evidenced” below means exactly that; it does **not** mean the competitor lacks the capability.

| Capability | Veridian/public benchmark | Proposed platform | Gap | Opportunity |
|---|---|---|---|---|
| FIT/FIV screening | **Confirmed:** EI-based screening, minimum-data philosophy, facility scale. citeturn20view0turn21search3 | Fully qualified FIT kernel with explicit applicability, calculations, assessment, evidence. | Engineering parity required first. | Establish gold-standard API/evidence architecture. |
| AIV | **Confirmed:** part of Veridian/Wood vibration ecosystem; Wood publicly documents AIV methods and detailed services. citeturn21search3turn17view2 | Separate AIV source/discontinuity domain. | Later mechanism. | Model source-to-many-discontinuities explicitly. |
| SBC | **Confirmed:** EI-based SBC assessment; branch diameter required. citeturn20view0turn19view4 | SBC susceptibility object linked to multiple excitation mechanisms. | Needs coupling model. | Avoid treating “SBC” as a single excitation mechanism. |
| Facility screening | **Confirmed:** single line through complete facility. citeturn20view0 | Batch line/case/mechanism DAG. | Must match usability and scale. | Incremental recomputation and API automation. |
| Data import | **Confirmed:** Excel line list. citeturn20view0 | CSV/Excel/API/P&ID/3D import with provenance. | Broader adapters. | Preserve original values, units, and source lineage. |
| Operating changes | **Confirmed:** risk can be recalculated when piping/process data change. citeturn20view0 | First-class immutable operating cases and baseline/modification comparison. | Public detailed scenario UX unclear. | Automated envelope screening and threshold sensitivity. |
| Mitigation | **Confirmed:** solution options for many high-LOF mechanisms and AM closeout. citeturn20view0turn21search0 | Findings → options → approved modification → recalculation → verification. | Comparable workflow needed. | Quantified before/after evidence. |
| Measurements | **Confirmed:** AM measurement storage; iDAC acquisition/remote monitoring. citeturn20view0turn21search1 | Raw waveform + derived signal products linked to operating cases and geometry. | Significant future scope. | Direct screening-to-RCA correlation. |
| RCA | Wood publicly offers vibration RCA services, including resonance, pulsation, stress and transients. citeturn21search7 | Structured hypothesis/evidence workspace. | Productized reasoning not publicly evidenced. | Explainable RCA graph, while retaining engineer approval. |
| 3D integration | HYSYS/SmartPlant/isometric interfaces described as under consideration in FAQ; current automated 3D workflow not publicly established. citeturn20view0 | Verified geometry extraction + model overlay. | Proposed platform opportunity. | Large workflow advantage if confidence/verification is handled correctly. |
| API-first execution | **Public evidence insufficient.** | Versioned calculation APIs as primary product architecture. | Potential differentiation. | Third-party integration, automation, reproducible execution. |
| Provenance/content hashes | **Public evidence insufficient.** | First-class method/master/source hashes. | Potential differentiation. | Strong qualification and audit evidence. |
| Calculation explainability | Public product focuses on screening/results; depth of machine-readable evidence not documented. | Result → Why → Evidence → full trace. | Potential differentiation. | Auditable engineering rather than black-box score. |
| Nonlinear dynamics | Wood provides advanced simulation/FEA services, but Veridian productized nonlinear support-state workflow is not publicly documented. citeturn21search6turn19view3 | Explicit linear/piecewise/nonlinear analysis classes. | Long-term. | Connect field-observed support behavior to higher-tier analysis. |

The strongest opportunity to exceed the public benchmark is therefore **not a prettier LOF calculator**. It is an **engineering evidence platform** in which every calculation is deterministic, method-versioned, master-versioned, machine readable, scenario aware, and traceable into facility findings, measurements, RCA, mitigation, and verification.

## Engineering method map and the FIV–FIT gold vertical

### Industry method landscape

**Published recommendation.** The most directly relevant overall process-piping methodology remains the Energy Institute's *Guidelines for the avoidance of vibration induced fatigue failure in process pipework*, second edition, January 2008. EI describes it as guidance for minimizing vibration-induced fatigue risks in process pipework. The 2018 subsea guidance was produced because topsides/onshore guidance did not fully cover the different subsea context. citeturn16search0turn16search4

As of August 2026, the forthcoming third edition is especially important. Public ASME conference material states that it has progressed through consultation and committee approval and will introduce an updated core-plus-technical-modules structure informed by industry surveys, operator experience, AIV work, multiphase research, and the 2018 subsea guidance. Until EI actually publishes it, however, a production system should not invent future rules. citeturn16search9

**Published requirement.** ASME B31.3-2024 remains the general process-piping code covering materials, components, design, fabrication, assembly, erection, examination, inspection, and testing. It is not itself a substitute for a mechanism-specific vibration-screening methodology. citeturn15search11

**Published requirement/recommendation for reciprocating machinery.** API Standard 618 is now **6th Edition, May 2024** for reciprocating compressors, including pulsation suppression devices among its scope. API Standard 688, **2nd Edition, October 2023**, covers pulsation and vibration control for reciprocating and rotary positive-displacement compressor/pump systems; API's current standards plan also shows a third edition of 688 in development. citeturn17view3turn18view0turn18view1turn15search14

**Published recommendation for structural measurements.** ISO 4866:2010 establishes principles for measurement and processing of vibration affecting fixed structures, including pipelines; it explicitly focuses on structural response rather than prescribing the excitation source. This distinction is useful for the field-measurement architecture. citeturn22view1

**Published recommendation for subsea VIV.** DNV's RP-F105 family is relevant to vortex-induced vibration/free-span fatigue and has been extended in DNV practice to more complex subsea spools/jumpers. It should not be confused with internal FIT/AIV screening. citeturn22view3

**Industry regulatory context.** UK HSE's offshore asset-integrity resources point users specifically to the Energy Institute vibration-induced fatigue guidance, demonstrating its role as recognized industry guidance rather than merely a Wood software convention. citeturn22view5

### Mechanism map

| Mechanism | Governing / typical method | Applicability and key inputs | Primary outputs | Empirical content / acceptance | Principal limitation |
|---|---|---|---|---|---|
| **FIT / broadband FIV** | EI AVIFF process screening; EI subsea method where applicable. Wood/Datacor implementations illustrate EI-style FIT workflow. citeturn16search0turn17view1turn19view0 | Fluid phase; density; velocity/mass flow; ID; wall; maximum span/support arrangement; gas viscosity where applicable; advanced structural frequency where required. citeturn19view0turn20view0 | Hydraulic quantities, excitation/kinetic-energy terms, support/stiffness representation, mechanism-specific screening metric/LOF, action category. | Empirical screening correlation and method-specific thresholds. | Broadband screening does not provide detailed dynamic stress or fatigue life; method scope must be checked. |
| **AIV / high-frequency acoustic excitation** | EI AVIFF AIV method; detailed acoustic-fatigue analysis where screening fails. citeturn17view2turn19view1 | Gas service, high pressure-drop device, upstream/downstream pressure, temperature, mass flow, molecular weight, source configuration, main/branch dimensions, distance and welded discontinuity geometry. citeturn19view0 | Source sound power, attenuation/source-discontinuity evaluation, LOF/assessment at susceptible weld. | Strongly empirical. Public Wood paper describes a first source-screening stage followed by geometry-dependent LOF. citeturn18view3 | Different physics and frequency range from FIT; not interchangeable. |
| **FIP / periodic dead-leg excitation** | EI FIP/periodic excitation screening plus acoustic-network/detail analysis as required. citeturn19view0turn17view2 | Gas, main/branch diameter, dead-leg length, velocity, density, sonic velocity, Reynolds number, process state. | Excitation frequency, acoustic natural frequency/resonance coincidence, pulsation risk/LOF. | Strouhal/acoustic-resonance correlations. | Can be strongly non-monotonic with flow because frequency coincidence governs. |
| **SBC vibration** | EI SBC screening plus branch modal/vibration/stress assessment. | Mainline excitation, branch diameter/length/mass, connection type, support/bracing, parent vibration and branch natural frequencies as assessment level increases. Wood says the EI assessment needs branch diameter. citeturn20view0turn19view4 | Susceptibility, resonance margin, predicted/measured response, stress/fatigue as detail increases. | Geometry and empirical screening factors; detailed response becomes structural mechanics. | **SBC is primarily a vulnerable structural class, not one excitation source.** It can be driven by FIT, pulsation, machinery, transients, etc. |
| **Mechanical excitation** | EI screening; machinery forcing/order analysis; detailed structural dynamic response. EI subsea guidance treats mechanical excitation separately. citeturn18view2 | Machine speed/orders, forcing source, attachment path, geometry/supports, structural modes. | Excitation orders, separation margins, vibration/stress. | Screening criteria may be empirical; response model physics-based. | Machinery vibration criteria such as ISO 20816 should not be blindly applied as piping-fatigue criteria. |
| **Vortex shedding / VIV** | DNV-RP-F105 for relevant subsea free spans/3D pipes; other methods for intrusive elements such as thermowells. citeturn22view3turn20view0 | External-flow or intrusive geometry, flow velocity, diameter, Strouhal behavior, structural frequencies/damping, boundary conditions. | Shedding frequency, reduced velocity, response/fatigue. | Empirical hydrodynamic coefficients plus structural mechanics. | External pipeline VIV and internal process FIT are different problems. |
| **Cavitation** | EI mechanism screening; valve/pump-specific cavitation criteria; detailed hydraulic/acoustic/structural analysis where necessary. EI subsea guidance lists cavitation/flashing separately. citeturn18view2 | Local pressure, vapor pressure, pressure recovery, valve/device behavior, fluid state, flow, geometry. | Cavitation likelihood/intensity indicator, local vibration risk, detailed response if needed. | Device/process correlations. | Local two-phase collapse and broadband excitation make it inappropriate to reuse FIT authority. |
| **Flashing** | EI mechanism screening; two-phase process analysis. citeturn18view2 | Pressure/temperature path, vapor pressure/phase equilibrium, quality, velocities, downstream geometry. | Flashing state and vibration/erosion risk indicators. | Thermodynamic + empirical. | Persistent vapor formation differs physically from cavitation collapse; they should be separately identifiable even if UI groups them. |
| **Two-phase / slug flow** | EI screening and specialist multiphase methods; detailed transient CFD/multiphase hydraulic forces coupled to structural response. | Phase rates/properties, flow regime, slug frequency/length, pressure/velocity histories, geometry, structural modes/supports. Wood describes time-varying CFD forces applied to structural models. citeturn19view3 | Time-varying forces, spectrum, response, dynamic stress and fatigue. | Multiphase correlations and/or numerical simulation. | Cannot safely be reduced to steady single-phase FIT. Small process changes can alter flow regime and force spectrum. |
| **Surge / water hammer** | EI surge/momentum-change screening plus hydraulic-transient simulation; structural load assessment. citeturn18view2turn19view1 | Valve/pump event, pressure/flow history, wave speed, pipe network, restraints, momentum changes. | Pressure transient, force vectors, impulses, support/nozzle loads, response/stress. | Mostly transient fluid mechanics plus model assumptions; acceptance comes from relevant piping/equipment design basis. | Peak pressure alone is not enough; structural momentum forces and timing matter. |
| **Reciprocating compressor/pump pulsation** | API 688; API 618 for reciprocating compressor systems; API 674 and related machinery standards for relevant pumps. citeturn17view3turn18view1 | Machine geometry/speed, cylinder/pump forcing, gas/liquid properties, acoustic network, supports/mechanical modes. | Pulsation, shaking force, pressure drop, mechanical response, stress. | Standardized pulsation/vibration criteria and acoustic-network modeling. | It is harmonic machinery-driven acoustics, not generic FIT. |
| **Structural resonance susceptibility** | Modal/FE/experimental modal assessment. EI treats structural response as a distinct concept. citeturn18view2 | Mass, stiffness, boundary states, support conditions, damping, excitation frequency. | Natural frequencies, modes, separation, amplification, response. | Mainly physics-based with uncertain boundary/damping parameters. | Resonance is **not an excitation mechanism**. |
| **Fatigue assessment** | EI detailed fatigue methodology plus applicable piping/fatigue design rules. | Dynamic stress range/time history, cycles, weld detail, material, S-N data, environment. | Damage, fatigue life/utilization. | S-N curves/detail factors and fatigue rules. | It is a damage/acceptance calculation downstream of excitation and response, not another vibration source. |

The physical separation is not merely organizational. Wood states that FIT excitation is predominantly low-frequency and related to turbulent energy around discontinuities; its AIV paper describes high-frequency acoustic energy from pressure-reducing devices acting on pipe-wall/weld discontinuities; FIP involves frequency coincidence between flow excitation and acoustic dead-leg resonance; multiphase/slug loading involves time-varying forces whose spectrum changes with flow regime. citeturn19view2turn18view3turn19view0turn19view3

Accordingly, **FIT, AIV, FIP, transient surge, multiphase/slug, cavitation/flashing, machinery pulsation and VIV must remain separate engineering kernels or separately qualified sub-kernels.** Shared orchestration is desirable; shared empirical authority is not.

### What “FIV” should mean in the first release

For the first vertical, define:

> **FIV–FIT = broadband, internally generated turbulent-flow excitation of a piping system, evaluated using a specified and licensed screening methodology.**

Wood describes FIT as turbulent energy generated when flow encounters significant discontinuities such as equipment, partially closed valves, bends, tees and reducers, with most excitation energy concentrated at frequencies below about 100 Hz. Datacor's EI-oriented implementation similarly characterizes FIT as a broadband, low-frequency concern near flow discontinuities. citeturn19view2turn19view0

Do **not** initially include dead-leg FIP in that same kernel. The older Wood/BETA ASME paper demonstrates why: its “FIV” case involves vortex formation at a dead leg coupled to an acoustic natural frequency—an entirely different, tonal resonance mechanism. citeturn17view2

### FIV–FIT engineering decomposition

The ideal production chain is:

```text
Raw process + geometry data
            ↓
Data resolution / unit normalization
            ↓
Input validation
            ↓
Applicability assessment
            ↓
Hydraulic quantities
            ↓
FIT excitation quantities
            ↓
Structural susceptibility representation
            ↓
Method-specific screening calculation
            ↓
Method-specific assessment
            ↓
Operating-case / location aggregation
            ↓
Evidence + explanation
```

The engineering chain can be made still more explicit:

```text
Process condition
    ↓
ρ, μ, Q or ṁ, phase / regime
    ↓
Flow area → velocity
    ↓
Dynamic / kinetic excitation quantity
    ↓
Local geometry and flow discontinuity context
    ↓
Span / support structural susceptibility
    ↓
FIT screening correlation
    ↓
Mechanism-specific LOF or screening metric
    ↓
Screening criterion / action class
    ↓
Finding: acceptable / monitor / detailed assessment / mitigate
```

**Published/vendor evidence.** Datacor's EI-style FIT implementation takes density, velocity, internal diameter and, for gas, dynamic viscosity from the hydraulic model; span length and wall thickness are user inputs; structural natural frequencies are used only in an advanced evaluation. It then calculates a representation of kinetic energy, gas viscosity adjustment, support-arrangement stiffness, a FIT factor and LOF. citeturn19view0

**Vendor/product behavior.** Wood's public FIT page uses \(\rho v^2\) as a quick kinetic-energy indicator and describes a standard screening method followed by an advanced evaluation using actual piping natural frequency. That public quick indicator is useful as an intuition and pre-screen, but it should **not be promoted to the platform's engineering authority unless the qualified method specification explicitly says so.** citeturn19view2

### FIT applicability should be a first-class result

A valid JSON payload is not necessarily an applicable engineering case. At minimum the applicability service should answer:

```text
Is the method licensed and qualified?
Is the fluid phase/regime within scope?
Is the piping material within scope?
Is the geometry representation supported?
Is the line size / wall representation supported?
Is the process condition within correlation range?
Is the support/span representation adequate?
Is the operating case steady enough for this method?
Are required thermophysical properties available?
Is a more specialized mechanism actually governing?
```

Pressure and temperature should **not automatically be mandatory FIT fields**. When density and viscosity are directly provided and the method allows that, pressure and temperature may only be provenance/context. When fluid properties are calculated from composition or an equation of state, pressure and temperature become required inputs to the property-resolution process. This distinction prevents process-property infrastructure from contaminating the engineering kernel.

Similarly, natural frequency and damping should not become hidden global defaults. Public Veridian and Datacor material supports span-based FIT screening without mandatory natural-frequency input, while advanced structural assessment does use actual modal information. citeturn20view0turn19view0turn19view2

### FIT output contract

An engineering-quality FIT API should return substantially more than one LOF:

| Output family | Recommended content |
|---|---|
| **Applicability** | applicable/not applicable/conditional; failed rule IDs; method-scope text; required escalation. |
| **Resolved hydraulics** | ID, flow area, mass/volumetric flow, density, viscosity where used, calculated velocity, Reynolds number if the method needs it. |
| **Excitation** | method-defined kinetic/dynamic excitation quantity; flow-source context; discontinuity identity where applicable. |
| **Structural susceptibility** | maximum span, support representation, method-defined stiffness/flexibility factor; natural-frequency information only if actually used. |
| **Calculation output** | raw mechanism-specific FIT metric and/or LOF; all significant intermediates permitted by the licensed method. |
| **Assessment** | criterion ID/revision, category, threshold comparison, utilization-like ratio only when mathematically meaningful. |
| **Aggregation** | governing operating case, line segment/location, source/discontinuity context. |
| **Sensitivity** | response to flow, density, span, wall or other method-sensitive variables; threshold crossings. |
| **Qualification** | kernel status and permitted engineering authority. |
| **Evidence** | input lineage, equations/method references, master revisions, software revision, deterministic execution digest. |

A **frequency range should only be returned if the selected method actually computes or specifies one**. A generic “expected low-frequency FIT” label is useful explanatory metadata, but the API must not fabricate a numerical excitation band from an empirical screening method that does not calculate it.

Likewise, a **source/discontinuity factor** should only appear when the qualified method defines such a factor. Flow-discontinuity context is physically relevant to FIT, but that does not authorize inventing a numerical geometry coefficient. citeturn19view2

### LOF is not a universal probability

**Engineering inference.** Public EI and vendor material shows separate calculations and input structures for FIT, AIV and FIP. AIV, for example, uses pressure-drop acoustic source quantities plus downstream discontinuity geometry, whereas FIT uses kinetic-energy/support variables and FIP uses acoustic-resonance variables. Public evidence does not establish that a numerical LOF of, say, 0.7 from one mechanism represents the same calibrated probability as 0.7 from another. citeturn19view0turn18view3turn17view1

Therefore:

```text
DO:
AIV:   raw method output → AIV action category
FIT:   raw method output → FIT action category
FIP:   raw method output → FIP action category

THEN:
show the action categories together at facility level.

DO NOT:
max(FIT_LOF, AIV_LOF, SBC_LOF) → "Universal vibration risk = 0.82"
```

A facility matrix may show each mechanism's **screening state**—for example acceptable, attention, detailed assessment required—but it should retain the mechanism-specific raw metric and criteria beneath that normalized workflow state.

### Operating cases and sensitivity

Operating cases should be first-class immutable entities:

```text
NORMAL
RATED
TURNDOWN
MAXIMUM
DESIGN
STARTUP
SHUTDOWN
UPSET
ALTERNATE_MODE
MODIFICATION
```

Wood confirms that Veridian can quantify changing risk by changing piping or process data, while FIT/FIP implementation experience shows why operating-envelope analysis matters. FIP in particular may be most severe away from maximum flow because acoustic/excitation frequency coincidence is important. citeturn20view0turn19view0

Each mechanism result should report:

```text
governingCaseId
governingLocationId
rawValueByCase
assessmentByCase
deltaFromBaseline
changedInputs
```

For FIT, a “flow at which screening is crossed” calculation can be extremely useful. It should be implemented as a controlled sensitivity solver rather than hard-coded algebra. Where the qualified correlation is proven monotonic over the requested interval, root finding is appropriate. Where the mechanism can be non-monotonic—FIP is the obvious example—the platform should sweep the domain and identify multiple crossing regions instead. citeturn19view0

### Mitigation framework

Mitigation should be represented as engineering options, not automatic design authority.

| Mechanism | Screening-level mitigation categories | Detailed/design considerations |
|---|---|---|
| FIT | Reduce velocity/flow where operationally possible; reduce unsupported span; improve support stiffness; smooth severe flow discontinuities. Wood publicly cites stiffness improvement, flow smoothing, dampers/snubbers. citeturn19view2 | Verify thermal flexibility, support loads, nozzle loads, accessibility and actual dynamic behavior before approving support changes. |
| AIV | Reduce source pressure drop/flow; stage pressure reduction; low-noise trim; increase source-to-discontinuity distance; modify/reinforce susceptible welded detail. Wood's ASME paper describes these categories. citeturn18view3 | Detailed acoustic-fatigue analysis; qualified weld/reinforcement design. |
| FIP | Change dead-leg length; modify flow or branch geometry; remove/bleed dead leg; alter resonance relationship. citeturn17view2turn19view0 | Confirm across full operating envelope. |
| SBC | Reduce branch length; reduce concentrated mass; brace/stiffen appropriately; redesign connection. | Check parent-pipe excitation, local mode, stress concentration and thermal/maintenance requirements. |
| Cavitation | Increase pressure margin; change valve/device operating point or selection; process modification. | Hydraulic/device design authority required. |
| Flashing | Reduce unfavorable pressure/phase change conditions where feasible; modify downstream geometry/material/design. | Detailed process/two-phase analysis. |
| Surge | Change valve closure/control sequence, surge protection, accumulator/vessel arrangements, support/restraint design. | Full transient hydraulic + structural reassessment. |
| Slug/multiphase | Change operating regime/process; routing/support modifications; damp structural response. | Detailed multiphase force and dynamic stress analysis may be required. Wood explicitly couples predicted time-varying forces to structural models. citeturn19view3 |
| Resonance | Change stiffness or mass; relocate support; alter forcing frequency; add damping where technically justified. | Recompute modes and verify the modified support/thermal state. |

Every recommendation should carry an authority label:

```text
SCREENING_OPTION
ENGINEERING_RECOMMENDATION
QUALIFIED_DESIGN_CHANGE
RCA_HYPOTHESIS
```

A generic support recommendation must never be displayed as “approved design” merely because the screening metric improves.

## Target API and product architecture

### One platform, many isolated engineering kernels

The preferred architecture is:

```text
Vibration Integrity Workspace
Engineering Console
3D Model / P&ID clients
External engineering systems
             │
             ▼
       Engineering API
             │
    ┌────────┴─────────┐
    │ Workflow / Batch │
    │ Result Service   │
    └────────┬─────────┘
             │
       Mechanism Adapter
             │
        Domain API
             │
    Qualified Pure Kernel
             │
      Pinned Method Data
```

The important boundaries are:

```text
UI               ≠ engineering equations
workflow          ≠ assessment criterion
generic API       ≠ generic correlation
project database  ≠ engineering masters
masters           ≠ mutable configuration
measurements      ≠ screening calculation
RCA reasoning     ≠ screening authority
report renderer   ≠ second calculation implementation
```

**Proposed architecture.** The pure engineering kernel should have no database reads, web calls, current-time dependency, user-session state, or implicit “latest” master lookup. Everything required to reproduce the result should be resolved and pinned before kernel invocation.

A conceptual FIT domain API should indeed resemble:

```text
validateFitInput()
evaluateFitApplicability()
resolveFitInput()
calculateFit()
assessFit()
runFitSensitivity()
```

rather than:

```text
calculateEverythingAndGiveRiskScore()
```

The separation improves unit testing, method migration, debugging, scenario analysis and qualification because each engineering question has a distinct contract.

For example:

- `validateFitInput()` answers whether the payload is structurally and numerically valid.
- `evaluateFitApplicability()` answers whether the chosen engineering method is valid for the case.
- `calculateFit()` executes equations only.
- `assessFit()` applies a separately versioned criterion to the raw result.
- `runFitSensitivity()` invokes a series of deterministic calculations and records the sweep strategy.

This mirrors the broader methodological distinction in EI guidance between screening, detailed assessment, monitoring and verification rather than treating them as one operation. citeturn18view2

### Service ownership

| System/component | Owns | Explicitly does not own |
|---|---|---|
| **Project/Facility service** | Facilities, systems, lines, segments, equipment refs, operating cases, data lineage. | Empirical equations. |
| **Geometry/3D service** | Model elements, geometry extraction, mapping, verification state. | Acceptance criteria. |
| **Engineering Master service** | Immutable method/master revisions, source references, qualification records. | Project input values. |
| **Calculation service** | Validation orchestration, kernel invocation, result snapshots, deterministic IDs. | Engineering equations themselves. |
| **Qualified kernel package** | Equations and narrowly scoped numerical logic. | Persistence, permissions, dashboards. |
| **Assessment service/library** | Versioned mechanism-specific criteria/action logic. | Physics calculation. |
| **Measurement service** | Sensors, sessions, calibration, raw waveforms, spectra, derived products. | Screening assumptions. |
| **RCA service/workspace** | Hypotheses, evidence links, rankings, engineer conclusions. | Automatic design authority. |
| **Reporting service** | Rendering immutable engineering snapshots. | Recalculation. |
| **UI** | Navigation, display preferences, edits awaiting save, visualization state. | Engineering truth. |
| **Audit service** | Who changed/approved/executed what and when. | Calculation method. |

### Generic engineering contract versus mechanism schema

The generic contract should standardize execution semantics while leaving physical outputs mechanism-specific.

**Generic across all engineering calculations:**

```text
calculationId
methodRevision
input schema revision
context
applicability
resolvedInputs
outputs
intermediates
checks
assessment
qualification
provenance
evidence
warnings
errors
execution
```

**Mechanism-specific:**

```text
FIT hydraulic/excitation quantities
AIV acoustic source/discontinuity quantities
FIP acoustic-resonance quantities
SBC geometric/modal quantities
surge time histories and force vectors
slug multiphase histories
reciprocating acoustic-network outputs
```

This gives API consistency without pretending the calculations are physically interchangeable.

### Request example

```json
{
  "calculationId": "VIB.FIT.FLOW_TURBULENCE",
  "method": {
    "methodId": "EI_PROCESS_FIT",
    "revision": "2008.2"
  },
  "inputs": {
    "pipe": {
      "outsideDiameter": { "value": 0.1683, "unit": "m" },
      "wallThickness": { "value": 0.00711, "unit": "m" },
      "maximumUnsupportedSpan": { "value": 5.2, "unit": "m" },
      "materialId": "CS_GENERIC"
    },
    "process": {
      "massFlow": { "value": 11.8, "unit": "kg/s" },
      "density": { "value": 37.4, "unit": "kg/m3" },
      "dynamicViscosity": { "value": 0.000014, "unit": "Pa.s" },
      "phase": "GAS"
    }
  },
  "context": {
    "projectId": "PRJ-001",
    "facilityId": "FAC-01",
    "lineId": "10-PG-101",
    "segmentId": "SEG-4",
    "operatingCaseId": "RATED",
    "sourceLocationId": "TEE-104"
  },
  "options": {
    "evidenceLevel": "FULL",
    "propertyResolution": "EXPLICIT_ONLY",
    "assessment": true
  }
}
```

Although the user's example proposes a separate `inputUnits` object, a production API is safer when the unit travels with each quantity. A bulk-import adapter may accept a column-level unit map, but its first action should be conversion to typed quantities.

### Result example

```json
{
  "status": "COMPLETED",
  "calculationId": "VIB.FIT.FLOW_TURBULENCE",
  "applicability": {
    "status": "APPLICABLE",
    "methodScope": "EI_PROCESS_FIT",
    "checks": [
      {
        "id": "FIT.PHASE",
        "status": "PASS",
        "actual": "GAS"
      },
      {
        "id": "FIT.SPAN",
        "status": "PASS"
      }
    ]
  },
  "resolvedInputs": {
    "pipeInternalDiameter": {
      "value": 0.15408,
      "unit": "m",
      "derivation": "OD_MINUS_2T"
    },
    "density": {
      "value": 37.4,
      "unit": "kg/m3",
      "source": "USER_SUPPLIED"
    }
  },
  "outputs": {
    "mechanism": "FIT",
    "mechanismSpecific": {
      "flowArea": {
        "value": 0.01864,
        "unit": "m2"
      },
      "velocity": {
        "value": 16.93,
        "unit": "m/s"
      },
      "screeningMetric": {
        "value": 0.73,
        "unit": "1",
        "definitionId": "FIT_METHOD_METRIC"
      }
    }
  },
  "intermediates": [
    {
      "id": "FIT.AREA",
      "value": 0.01864,
      "unit": "m2"
    }
  ],
  "checks": [
    {
      "id": "FIT.ASSESSMENT",
      "status": "PASS"
    }
  ],
  "assessment": {
    "status": "SCREENED_ACCEPTABLE",
    "criterionId": "FIT.CRITERION",
    "criterionRevision": "2008.2",
    "requiresDetailedAssessment": false
  },
  "qualification": {
    "kernelStatus": "QUALIFIED",
    "authority": "SCREENING",
    "qualificationRecordId": "QUAL-FIT-0042"
  },
  "provenance": {
    "kernelVersion": "fit-kernel@1.4.0",
    "methodRevision": "EI_PROCESS_FIT@2008.2",
    "masterSetId": "FIT-MASTER-2008-R3",
    "masterSetHash": "sha256:...",
    "inputSnapshotHash": "sha256:..."
  },
  "evidence": {
    "governingCaseId": "RATED",
    "governingLocationId": "TEE-104",
    "explanation": [
      "FIT method was applicable to the supplied case.",
      "The rated case governs the screened operating cases."
    ]
  },
  "warnings": [],
  "errors": [],
  "execution": {
    "deterministicDigest": "sha256:...",
    "engineVersion": "engineering-runtime@2.1.0"
  }
}
```

The numerical values above are illustrative API-shape examples, **not EI benchmark values or an engineering calculation**.

### Error taxonomy

Fail closed. Do not return a plausible LOF with warnings when essential authority is missing.

```text
VALIDATION_ERROR
    malformed / impossible input

APPLICABILITY_FAILURE
    input is valid but method does not apply

MASTER_DATA_MISSING
    required qualified coefficient/table absent

METHOD_NOT_QUALIFIED
    implementation exists but cannot issue screening result

CALCULATION_FAILURE
    numerical failure

ASSESSMENT_UNAVAILABLE
    raw calculation exists but no qualified acceptance criterion

AUTHORITY_RESTRICTED
    result may be exploratory but cannot be used for stated purpose
```

A result may therefore validly be:

```text
calculation = successful
assessment  = unavailable
authority   = exploratory
```

That is much safer than forcing every execution into pass/fail.

### Batch and facility execution

Use the exact same deterministic kernel for one component and 10,000 component-case combinations.

```text
Facility batch job
      ↓
expand:
Line × Segment × Operating Case × Applicable Mechanism
      ↓
dependency resolution
      ↓
parallel pure-kernel execution
      ↓
immutable result snapshots
      ↓
line aggregation
      ↓
facility aggregation
```

A content-addressed calculation cache should be keyed approximately by:

```text
kernelVersion
+ methodRevision
+ masterSetHash
+ normalizedInputHash
+ calculationOptionsHash
```

Changing a dashboard label should invalidate nothing. Changing one operating case's mass flow should only invalidate assessments that consume that value. Changing an FIT master should invalidate affected FIT results but not AIV or surge results unless those mechanisms explicitly depend on the same qualified master revision.

## Canonical vibration data, engineering masters, provenance, and units

### Asset/data model

The canonical asset hierarchy should be richer than a line list but simpler than a full finite-element database:

```text
Portfolio
  └─ Project
      └─ Facility
          └─ System
              └─ Line
                  ├─ Segment
                  │   ├─ PipeElement
                  │   ├─ Fitting / Valve
                  │   ├─ Support
                  │   └─ Discontinuity
                  └─ SmallBoreConnection
```

Engineering work adds orthogonal entities:

```text
OperatingCase
MechanismAssessment
CalculationSnapshot
Finding
Mitigation
Verification
MeasurementSession
RcaCase
```

This is critical because an **AIV source is not necessarily the same object as its susceptible downstream weld**, and one source can interact with multiple discontinuities. Datacor's public implementation specifically calls out this many-to-many source/discontinuity relationship for AIV. citeturn19view0

### Canonical field model

| Domain | Shared canonical fields | Classification principle |
|---|---|---|
| **Geometry** | OD, ID, wall thickness, nominal size, material, lining, insulation, centerline geometry, straight length, bend, tee, reducer, valve, branch, concentrated mass. | Store physical facts once. Never add a generic empirical “vibration factor” to the geometry object. |
| **Supports** | location, type, restrained directions, nominal stiffness, boundary condition, gap, friction, contact state, support condition, looseness/degradation observations. | Gap/friction/contact are optional physical state data, not global defaults. |
| **Process** | mass flow, volumetric flow, velocity, density, viscosity, phase, pressure, temperature, vapor pressure, speed of sound, composition/properties, pressure drop. | Raw and derived values must retain derivation/source. |
| **Dynamic** | excitation frequencies/bands, harmonics/orders, natural frequencies, modal damping, predicted/measured response, mode/ODS references. | Only required by methods that actually consume them. |
| **Transient** | time, pressure, velocity, mass flow, density where needed, forces/moments, impulse, event definition. | Time coordinate and frame conventions must be explicit. |
| **Measurement** | acceleration, velocity, displacement, strain/pressure where relevant, overall/RMS/peak/p-p, time waveform, FFT, phase, coherence, orders, ODS/modal products. | Separate raw channels from derived signal processing products. |

Every engineering quantity should support a provenance wrapper:

```json
{
  "value": 37.4,
  "unit": "kg/m3",
  "source": {
    "type": "PROCESS_SIMULATION",
    "sourceId": "HMB-2026-04",
    "field": "LINE_101_DENSITY"
  },
  "quality": "VERIFIED",
  "effectiveCaseId": "RATED",
  "timestamp": null
}
```

### Mandatory versus optional inputs

Do not define one “vibration input object” whose required fields include everything imaginable.

Instead:

```text
Canonical data model
        ↓
method-specific requirement schema
        ↓
resolved input
```

Example:

| Field | FIT basic | FIT advanced | AIV | FIP | Surge | Nonlinear structural |
|---|---:|---:|---:|---:|---:|---:|
| ID | Required | Required | Required | Required | Required | Required |
| Wall | Required | Required | Required | Context/method | Required | Required |
| Density | Required | Required | Method/source dependent | Required | Required | Required if fluid mass modeled |
| Viscosity | Gas/method dependent | Gas/method dependent | Usually property context | Often required | Hydraulic model dependent | No |
| Span | Required | Required | Not generic requirement | Structural follow-up | Structural follow-up | Geometry required |
| Natural frequency | No | Yes/derived | No for source screening | Acoustic frequency derived separately | Structural response only | Usually derived |
| Damping | No | Only if detailed response requires | No for source screening | Not generic | Structural response | Required/model specific |
| Pressure history | No | No | No | No | Required for transient result path | As loading input |
| Gap/friction | No | No | No | No | Only detailed support behavior | Mechanism defining |

The public FIT implementations are strong evidence for keeping natural frequency out of the basic mandatory schema. citeturn19view0turn19view2

### Source-of-truth model for process properties

A single value such as density may come from:

```text
manual engineering entry
heat-and-mass balance
process simulator
online historian
laboratory/PVT data
equation-of-state calculation
calculation-derived value
```

The platform should never overwrite that distinction.

For derived values, store:

```text
value
unit
resolverId
resolverVersion
sourceInputs
sourceInputHashes
propertyPackage
calculationTimestamp
reviewStatus
```

This will become essential for gas AIV/FIP and multiphase work, where speed of sound, molecular properties, vapor pressure and phase behavior may materially affect the assessment. Datacor's public FIP description, for example, explicitly notes acoustic natural-frequency dependence on pressure, temperature and molecular weight. citeturn19view0

### Engineering master architecture

A qualified master system should use immutable, versioned data sets.

```text
MethodDefinition
    └─ MasterSet
         └─ MasterRecord
```

Recommended `MasterRecord`:

```json
{
  "masterId": "FIT_SUPPORT_FACTOR",
  "recordId": "FIT_SUPPORT_FACTOR:CASE_A",
  "methodId": "EI_PROCESS_FIT",
  "methodRevision": "2008.2",
  "sourceDocument": "AVIFF",
  "sourceEdition": "2",
  "sourceLocation": {
    "section": "...",
    "page": "...",
    "table": "...",
    "equation": "..."
  },
  "nativeUnitSystem": "METHOD_NATIVE",
  "applicability": {},
  "value": "...",
  "qualificationStatus": "QUALIFIED",
  "sourceArtifactHash": "sha256:...",
  "normalizedRecordHash": "sha256:...",
  "reviewer": "...",
  "reviewDate": "..."
}
```

Exact page/table/equation references should be populated from the legally licensed source during implementation. This report deliberately does not invent proprietary or paywalled EI coefficients.

Master-state transitions:

```text
DRAFT
  ↓
TECHNICAL_REVIEWED
  ↓
VERIFIED_AGAINST_SOURCE
  ↓
QUALIFIED
  ↓
SUPERSEDED / WITHDRAWN
```

A calculation holding `FIT-MASTER-2008-R3` must continue to reproduce that master indefinitely. There should be **no runtime meaning of “use latest master” for a qualified immutable result**.

### Why source hashes are valuable—and insufficient alone

**Proposed architecture.** Source-file hashes should be qualification evidence.

They solve several practical failure modes:

```text
"AVIFF_2008_final.pdf"
"AVIFF_2008_final_v2.pdf"
"AVIFF_2008_correct.pdf"
"AVIFF_NEW.pdf"
```

can be proven byte-identical or different regardless of filename.

A source hash also allows a qualification dossier to prove which exact digital artifact was used to transcribe a table or coefficient.

But a content hash proves only **identity**, not **correctness or authority**. It must therefore be paired with document title, edition, publisher, licensing provenance, record-level transcription review, semantic version, reviewer, and qualification approval. DNV-RP-A203's technology-qualification philosophy is relevant here because it emphasizes systematic qualification and traceability from functions and requirements through qualification activities and evidence. citeturn23search2

For normalized engineering masters, use a second hash over a deterministic serialization of the actual structured records. This detects the important case where the source PDF is unchanged but the software's transcribed master data have changed.

### Prohibited master-data practices

The production platform should fail qualification if any of these exist:

```text
magic number embedded in UI code
coefficient whose source is "old spreadsheet"
default damping with no method applicability
table manually copied with no reviewer
coefficient changed during unit conversion without derivation
"latest.xlsx" as authority
multiple source files distinguished only by filename
run-time mutation of qualified master records
silent fallback when a master record is missing
```

Wood itself has publicly described the integrity problems associated with spreadsheet-based vibration assessments, including user error, macros, developer dependency and revision-control issues; those are exactly the weaknesses an API-first qualification model can structurally eliminate. citeturn16search3

### Unit policy

The API should use **canonical SI internally at the platform boundary**, but empirical kernels require more nuance.

Recommended rule:

> An empirical correlation should execute in its historical native units unless it has been formally re-derived, benchmarked, reviewed and separately qualified in SI.

Thus:

```text
Imported quantity
    ↓
validated unit conversion
    ↓
canonical SI project value
    ↓
mechanism adapter
    ↓
canonical SI → correlation-native units
    ↓
qualified correlation
    ↓
native output → canonical SI
```

Why retain a native correlation layer? Public AIV formulations demonstrate that empirical equations can contain fitted numerical constants. Re-expressing such an equation is not merely a UI conversion unless every dimensional implication of the coefficient is correctly transformed. citeturn18view3

The platform must explicitly represent:

| Quantity | Rule |
|---|---|
| Pressure | Store unit **and** reference: absolute, gauge, differential. Convert to absolute where physical/property equations require it. |
| Temperature | Store °C/°F for display; resolve to an absolute scale for equations requiring thermodynamic temperature. |
| Damping | Canonical dimensionless ratio; record source representation such as fraction, percent critical, logarithmic decrement if imported. |
| Frequency | Hz canonical; RPM/order representations retain conversion context. |
| Phase angle | rad or degree explicitly. |
| Force/moment | N/N·m canonical; coordinate frame required for vectors. |
| Time history | seconds canonical, explicit sample interval/time vector and time basis. |
| Empirical coefficients | Must declare `nativeUnitSystem` and quantity dimensions/representation. |

Qualification must include paired SI/US input vectors proving that physically identical cases produce equivalent canonical outputs to a defined numerical tolerance. This is a much stronger test than independently testing individual conversion functions.

## Vibration Integrity Workspace, facility workflow, scenarios, 3D, mitigation, and reporting

### Product hierarchy

The main user experience should be:

```text
Portfolio
  ↓
Project / Facility
  ↓
System
  ↓
Line
  ↓
Operating Case
  ↓
Vibration Screening
  ↓
Mechanism
  ↓
Finding
  ↓
Mitigation / RCA
  ↓
Verification
```

The generic **Engineering Calculation Console** should remain available but become the secondary interface used for API debugging, benchmark development, method qualification, and full calculation evidence.

The ordinary integrity engineer should work primarily in the **Vibration Integrity Workspace**.

### Facility dashboard

A useful facility dashboard should answer immediately:

```text
How much of the facility has actually been screened?
What data are missing?
Which lines require engineering attention?
Which mechanisms are driving those findings?
Which operating cases govern?
Which findings remain open?
What changed since the last approved assessment?
```

Recommended top-level indicators:

| Dashboard element | Meaning |
|---|---|
| Lines in scope / screened | Coverage, not risk. |
| Complete / incomplete | Data readiness. |
| Applicable mechanisms | Which calculations are relevant. |
| Screening findings by action class | Engineering prioritization. |
| High-priority locations | Local source/discontinuity or branch findings. |
| Mechanism distribution | FIT/AIV/FIP/SBC/etc., each retaining own semantics. |
| Operating-case coverage | Normal/rated/turndown/startup/etc. |
| Open mitigation actions | Workflow state. |
| Measurement-required findings | Field-program queue. |
| Reassessment required | Results stale after data/model/method change. |

Veridian provides an industry precedent for both facility-scale screening and anomaly tracking, but the proposed platform should avoid a dashboard that visually implies all raw LOFs are numerically equivalent. citeturn20view0turn21search0

### Line workspace

The line workspace should use progressive disclosure.

**Primary view:**

```text
LINE 10-PG-101
Rated case

Overall screening status: ACTION REQUIRED

FIT   Review / detailed assessment
AIV   Not applicable
FIP   Acceptable
SBC   2 branches require review
Surge Not assessed — transient data missing
```

The next level answers **why**:

```text
Governing mechanism: FIT
Governing case: Rated
Governing location: Segment SEG-4
Key contributors:
  high calculated velocity
  long unsupported span

Applicability: Applicable
Method: EI process FIT, specified revision
```

The deepest level exposes:

```text
resolved inputs
intermediates
method-specific output
criterion
master records
source references
kernel revision
unit conversions
input provenance
qualification
deterministic digest
```

This gives the desired UX:

```text
Simple result
    ↓
Engineering explanation
    ↓
Full calculation evidence
```

without turning every user into a calculator developer.

### Missing data should be visible as engineering state

Do not translate missing data into default assumptions merely to turn the screen green.

A mechanism tile should be able to say:

```text
SURGE
Status: NOT ASSESSED

Missing:
  transient event definition
  valve closure characteristic
  wave-speed basis

This mechanism has not been shown acceptable.
```

This is materially different from:

```text
SURGE: LOW RISK
```

### 3D integration

A 3D environment can create a genuine competitive advantage because vibration risk is spatial. A high-risk **line** is often less actionable than a high-risk **tee, branch, pressure-reducing source, unsupported span or small-bore connection**.

The target workflow should be:

```text
Facility model
      ↓
geometry + metadata extraction
      ↓
line/segment/support/SBC graph
      ↓
verification queue
      ↓
screening
      ↓
mechanism-specific overlays
      ↓
click element
      ↓
governing case + mechanism + evidence
```

Potential automated extraction includes:

```text
centerline length
OD / nominal size / specification
wall thickness when model metadata supports it
elbows / bends
tees
reducers
valves
branches
small-bore connections
nominal support locations
unsupported span candidates
source/discontinuity distances
```

The real opportunity is not merely coloring the model. It is using geometry as a **structured engineering input generator**.

### Engineering dangers of automatic geometry inference

A CAD/model object is not automatically an engineering-verified dynamic boundary condition.

The platform must distinguish:

```text
MODEL_EXTRACTED
ENGINEER_CONFIRMED
FIELD_VERIFIED
```

for critical attributes.

Examples:

| 3D observation | What can safely be inferred | What cannot safely be assumed |
|---|---|---|
| Support object exists | Nominal support location/type. | That the pipe is actually in contact or that the support is dynamically stiff. |
| Clamp geometry exists | Nominal clamp configuration. | Friction, looseness, preload, degradation. |
| Pipe centerline | Nominal span geometry. | As-built sag, temporary supports, field rerouting. |
| SBC modeled | Nominal branch location/geometry. | Actual concentrated valve/instrument mass unless modeled reliably. |
| Valve present | Potential hydraulic/source object. | Actual operating position, trim, dynamic behavior. |
| Line metadata says schedule | Nominal wall basis. | Current wall after corrosion/erosion unless linked to inspection data. |

A line imported from 3D should therefore carry `geometryConfidence` and verification tasks before engineering authority is issued.

This is especially important because support behavior materially affects FIT and SBC response, while Wood's screening approach sometimes reduces support representation to maximum unsupported span. An automatically identified nominal support is not proof of an effective support. citeturn20view0turn19view4

### Baseline versus modification

Scenario comparison should be an explicit workflow:

```text
BASELINE — approved facility state
          │
          ├── Normal
          ├── Rated
          ├── Turndown
          └── Design
          
MODIFICATION MOC-247
          │
          ├── Normal
          ├── Rated
          ├── Turndown
          └── Design
```

A modification should contain overrides rather than copied uncontrolled data:

```text
mass flow: 11.8 → 15.4 kg/s
support S-104: existing → proposed added restraint
valve CV-22: existing trim → proposed trim B
```

The result viewer can then explain:

```text
FIT assessment changed because:
  velocity +24%
  maximum unsupported span -36%

AIV changed because:
  pressure drop across CV-22 changed
```

This supports MOC and debottlenecking directly; Veridian's public material similarly emphasizes evaluating changing process/piping conditions and alternative scenarios. citeturn21search3turn20view0

### Facility workflow

The production facility workflow should be:

```text
Create facility
    ↓
Import line/process/model data
    ↓
Resolve tags and operating cases
    ↓
Data-quality / completeness review
    ↓
Qualitative mechanism applicability
    ↓
Semi-quantitative screening
    ↓
Prioritized findings
    ↓
Engineer review
    ↓
Inspection / measurement / detailed analysis
    ↓
Mitigation proposal
    ↓
Modified scenario
    ↓
Recalculation
    ↓
Physical verification
    ↓
Finding closeout
```

This broadly parallels the publicly evidenced Veridian lifecycle, but the proposed platform should make every transition machine readable and auditable. Veridian confirms qualitative then semi-quantitative assessment, facility-scale screening, AM anomaly closeout, field measurement linkage, and scenario changes. citeturn20view0turn21search0turn21search3

### Reporting

There must be **one calculation path** and multiple renderers:

```text
Qualified CalculationSnapshot
       ├─ UI
       ├─ PDF
       ├─ JSON/API
       ├─ CSV
       └─ Excel export
```

The PDF generator must never reimplement the equation.

A facility report should contain:

```text
facility and scope
data completeness
operating cases
method inventory
qualification status
line register
mechanism findings
high-priority location register
assumptions/data gaps
mitigation register
verification status
master/method revisions
software revisions
calculation IDs
audit approvals
```

The line appendix should be generated from exactly the same `CalculationSnapshot` returned by the API.

## Engineering qualification, software quality, and facility scale

### Qualification philosophy

The correct status ladder is:

```text
BLOCKED
   ↓
METHOD_SPECIFIED
   ↓
IMPLEMENTED
   ↓
QUALIFIED
   ↓
SCREENING_AUTHORITY
   ↓
DESIGN_AUTHORITY
```

These states mean different things.

| State | Meaning |
|---|---|
| **BLOCKED** | Source, IP/license, scope, critical technical question, or required master is unresolved. |
| **METHOD_SPECIFIED** | Engineering basis, applicability, equations/tables, units, assumptions, outputs and criteria are documented. |
| **IMPLEMENTED** | Code exists and passes developer-level tests. No claim of engineering acceptance. |
| **QUALIFIED** | Defined benchmark evidence passed and independent technical review completed. |
| **SCREENING_AUTHORITY** | Organization permits this qualified implementation to issue screening assessments for a clearly bounded scope. |
| **DESIGN_AUTHORITY** | Organization permits the method to support final design conclusions for a defined use case. This may require a separate detailed method and may never apply to the screening kernel. |

The distinction is consistent with broader engineering qualification principles. DNV-RP-A203 emphasizes traceable qualification activities and evidence; implementation alone is not qualification. citeturn23search2

### FIT qualification dossier

Before FIT reaches `QUALIFIED`, the dossier should include:

```text
method specification
applicability specification
source/license register
master-data transcription review
unit specification
independent calculation benchmarks
legacy workbook comparisons, if relevant
industry example comparisons
boundary tests
invalid-input tests
applicability-failure tests
unit-invariance tests
numerical precision definition
regression suite
sensitivity tests
determinism tests
fail-closed tests
software/version provenance
independent engineering review
known limitations
```

A legacy workbook is useful as one benchmark but **must not define authority by itself**. It may contain undocumented defaults, macros, unit assumptions or transcription errors; Wood has itself highlighted spreadsheet/revision-control shortcomings in vibration-assessment workflows. citeturn16search3

### FIT benchmark matrix

| Benchmark family | Example cases | Required expectation |
|---|---|---|
| Low excitation | Low-flow valid case | Exact benchmark parity; acceptable classification where benchmark says so. |
| Nominal | Representative production case | Hand-calculation/reference parity. |
| High excitation | High-flow valid case | Correct increasing response where the specified method predicts it. |
| Near threshold | Just below / at / just above screening boundary | Stable and correct boundary behavior. |
| Pipe geometry | OD/ID/wall variations | Correct dimensional dependence. |
| Span/support | Short / nominal / long span | Correct support/susceptibility response. |
| Gas/liquid | Cases valid for each explicitly supported phase | Correct method branch and properties. |
| Operating cases | Normal/rated/turndown/max | Correct governing-case selection. |
| Unit representation | Physically identical SI/US cases | Same canonical engineering result within tolerance. |
| Missing master | Remove one required factor | Hard failure, not default. |
| Missing input | Remove required density/span/etc. | Validation failure with field-specific error. |
| Out-of-scope case | Unsupported material/regime/etc. | Applicability failure; no authoritative assessment. |
| Sensitivity | Controlled parameter sweeps | Expected trends and recorded discontinuities. |
| Determinism | Repeat identical execution | Identical canonical result/digest. |

**Property-based tests** are especially valuable for universally true numerical properties: positive area for physically valid diameter/wall, unit-conversion reversibility within tolerance, deterministic execution, and absence of NaN/Infinity for the applicable domain. They should not enforce a monotonicity assumption unless the engineering method specification says monotonicity is physically valid.

### Independent engineering review

The review should be independent of the person who transcribed/coded the correlation.

Minimum approval roles:

```text
Method owner / vibration engineer
Independent checker
Software qualification owner
Release approver
```

For major safety-critical use, the organization should be able to add an independent third-party assurance workflow. HSE's offshore regime provides a broader example of independent verification being used for safety-critical integrity functions, though that regulatory requirement is jurisdiction- and asset-specific and should not be generalized as a universal software mandate. citeturn22view5

### Software quality target

ISO/IEC 25010:2023 defines a current software product-quality model, providing an appropriate general framework for specifying measurable software quality. Security should be incorporated into the development lifecycle; NIST SP 800-218 provides the Secure Software Development Framework for that purpose. citeturn23search1turn23search0

The engineering application should impose additional domain-specific requirements:

```text
deterministic kernels
immutable calculation snapshots
explicit API versions
explicit method versions
explicit master-data versions
complete reproduction from snapshot
no silent defaults
no "latest" references inside qualified results
signed/controlled engineering releases
audit logging
role-based approvals
regression benchmark gating
backward-compatible result retrieval
```

UI accessibility should target **WCAG 2.2 AA**. WCAG 2.2 is a W3C Recommendation and W3C recommends using the current version when developing or updating accessibility policies. citeturn23search32

### Version dimensions must remain separate

Do not publish:

```text
Vibration Platform v2.7
```

as sufficient provenance.

A result may instead have:

```text
apiContractVersion       2.1
runtimeVersion           3.4.2
mechanismAdapterVersion  fit-adapter@1.8.0
kernelVersion            fit-kernel@1.4.0
methodRevision           EI_PROCESS_FIT@2008.2
assessmentRevision       FIT_ASSESS@2008.2-R2
masterSetRevision        FIT-MASTER@R3
propertyResolverVersion  PR-EOS@2.0
```

This is crucial now because the EI third edition is being prepared for publication. A future 2026/2027 FIT method implementation must be allowed to coexist with the qualified 2008 implementation so historic results remain reproducible. citeturn16search9turn16search0

### Immutable results and staleness

Never edit a historical result in place.

```text
CalculationSnapshot A
inputs X
method R1
result Y

mass flow changes
       ↓

CalculationSnapshot B
inputs X'
method R1
result Y'
```

Snapshot A remains the record of what was previously known and approved.

When source data change, mark affected results:

```text
CURRENT
STALE_INPUT_CHANGED
STALE_MASTER_SUPERSEDED
STALE_METHOD_SUPERSEDED
STALE_MODEL_CHANGED
```

“Superseded” should not imply that the historical result was invalid at the time.

### Performance and scale

The architecture should scale by orchestration rather than altering the kernel.

| Scale | Execution recommendation |
|---|---|
| One calculation | Synchronous API call. |
| One line × several cases/mechanisms | Synchronous when small; optional asynchronous for expensive kernels. |
| ~100 lines | Batched execution with parallel mechanism/case workers. |
| ~1,000 lines | Asynchronous facility job, progress reporting, incremental persistence. |
| Full facility / many scenarios | Dependency DAG, cache, distributed workers, resumable jobs, result aggregation. |
| Time-history/CFD/nonlinear | Dedicated heavyweight job queue separate from lightweight screening pool. |

The deterministic result must not depend on thread scheduling or worker topology.

A useful dependency graph is:

```text
Process case
 ├─ density
 ├─ flow
 └─ pressure drop
      │
      ├─ FIT(Line A, Case 1)
      ├─ AIV(Source V1 → Weld W7)
      └─ FIP(Deadleg D2)

Geometry
 ├─ span
 └─ branch size
      │
      ├─ FIT(...)
      └─ SBC(...)
```

Changing branch mass should not trigger every AIV source calculation. Changing fluid density may affect multiple mechanisms. The dependency graph should be generated from the actual resolved-input lineage.

### Recalculation strategy

Use:

```text
Data mutation
    ↓
calculate changed field hash
    ↓
find dependent resolved inputs
    ↓
mark result snapshots stale
    ↓
enqueue only affected calculations
```

This will matter enormously once a 3D model contains thousands of elements and the process envelope contains multiple scenarios.

### Quality gates in CI/CD

A qualified kernel release should not deploy merely because unit tests pass.

Proposed gate:

```text
Source/method review       PASS
Master-data hash review    PASS
Static/type checks         PASS
Unit tests                 PASS
Property tests             PASS
Golden benchmarks          PASS
Boundary tests             PASS
SI/US invariance           PASS
Failure-mode tests         PASS
Determinism                 PASS
API schema compatibility   PASS
Independent review         SIGNED
Qualification package      APPROVED
```

Security development practices should be integrated alongside engineering assurance rather than treated as a later penetration-test activity, consistent with the NIST SSDF approach. citeturn23search0

## Field measurements, RCA, nonlinear dynamics, roadmap, and first production PRs

### Measurement architecture

The long-term platform should connect screening predictions to actual field evidence without mixing the two authorities.

A measurement hierarchy should be:

```text
MeasurementSession
   ├─ OperatingCaseSnapshot
   ├─ InstrumentConfiguration
   ├─ Channel
   │   ├─ Sensor
   │   ├─ Location / orientation
   │   ├─ Calibration
   │   └─ RawTimeSeries
   └─ SignalProduct
       ├─ Overall
       ├─ RMS
       ├─ Peak
       ├─ PeakToPeak
       ├─ FFT / PSD
       ├─ Order spectrum
       ├─ Phase
       ├─ Coherence
       ├─ ODS
       └─ Modal result
```

ISO 4866 supports the general principle that structural-vibration assessment requires proper measurement and processing of response quantities in terms of frequency, duration and amplitude. citeturn22view1

Raw data should be immutable. FFTs, filters, integration from acceleration to velocity/displacement, order tracking, coherence and other products should retain a `processingRecipeId` and version.

Wood's iDAC and AM show the commercial value of joining remote data acquisition and integrity/anomaly management, while Wood's troubleshooting offering explicitly spans pulsation, resonance, stress and transients. citeturn21search1turn21search0turn21search7

### RCA reasoning chain

The RCA workspace should operationalize:

```text
Potential excitation mechanism
           ↓
Expected signature
           ↓
Measured spectrum / waveform
           ↓
Operating/process correlation
           ↓
Structural natural frequencies
           ↓
Mode shape / ODS / coherence
           ↓
Support/contact observations
           ↓
Competing hypotheses
           ↓
Mitigation experiment
           ↓
Verification
```

Example reasoning objects:

```json
{
  "hypothesisId": "RCA-H12",
  "mechanism": "FIP.DEADLEG_PULSATION",
  "claim": "Dead-leg acoustic resonance is driving the observed pipe mode",
  "predictions": [
    "narrowband pressure/vibration component near predicted FIP frequency",
    "frequency changes with operating condition",
    "coherent response near branch"
  ],
  "evidenceFor": [],
  "evidenceAgainst": [],
  "status": "UNDER_REVIEW",
  "engineerConclusion": null
}
```

Automation can reasonably perform:

```text
candidate mechanism generation
frequency matching
order matching
spectral-peak detection
operating-state correlation
predicted-vs-measured frequency comparison
coherence mapping
location ranking
evidence completeness checks
```

It should **not** autonomously assert:

```text
ROOT CAUSE CONFIRMED
DESIGN MODIFICATION APPROVED
```

without engineering approval.

The reason is fundamental: similar measured vibration can be produced by different forcing mechanisms, support conditions can change in operation, and measured response alone does not prove causality. Wood's service model similarly combines field measurements, specialist dynamics expertise and detailed analysis for troubleshooting rather than treating one screening score as RCA. citeturn21search6turn21search7

### Nonlinear vibration model

The data/model architecture should explicitly classify structural analysis as:

```text
LINEAR_MODAL
PIECEWISE_LINEAR_CONTACT
NONLINEAR_TIME_HISTORY
```

**LINEAR_MODAL**

Suitable when:

```text
small perturbations
fixed support state
linear stiffness
linearized damping
no significant impact/contact switching
```

**PIECEWISE_LINEAR_CONTACT**

Required when relevant behavior includes:

```text
support gap
one-way restraint
lift-off
multiple known contact states
state-dependent stiffness
```

The model may solve different linear states and transitions rather than pretending one set of modes describes all conditions.

**NONLINEAR_TIME_HISTORY**

Required when the behavior materially involves:

```text
impact
stick-slip
frictional hysteresis
repeated contact separation
looseness
amplitude-dependent stiffness
amplitude-dependent damping
complex nonlinear restraints
large transient response
```

A platform should never hide a gapped support inside a field such as:

```json
{ "naturalFrequency": 8.2 }
```

without identifying which contact state produced that frequency.

This becomes particularly important for SBCs and piping supports because local resonance can strongly amplify parent-pipe motion; Wood's SBC material emphasizes that relatively modest mainline vibration may lead to much larger branch response at resonance. citeturn19view4

### Prioritized API-first opportunities

Ranked by engineering value rather than novelty:

| Priority | Opportunity | Engineering value |
|---:|---|---|
| 1 | **Deterministic, qualified mechanism APIs with complete evidence** | Foundational. Makes every later UI/integration trustworthy and reproducible. |
| 2 | **First-class method/master provenance** | Eliminates silent workbook/default/revision ambiguity. |
| 3 | **Operating-case envelope screening** | Directly addresses real changes in flow/pressure/mode and identifies governing conditions. |
| 4 | **Facility-scale batch + data completeness** | Converts calculations into integrity management. |
| 5 | **Verified 3D geometry mapping** | Reduces manual geometry work and makes findings spatially actionable. |
| 6 | **Before/after mitigation scenario analysis** | Turns screening into engineering decision support. |
| 7 | **Measurement ↔ prediction correlation** | Bridges proactive screening and field diagnostics. |
| 8 | **Structured RCA evidence graph** | Makes troubleshooting more systematic and auditable. |
| 9 | **Automated geometry extraction** | High value only after confidence/verification workflow exists. |
| 10 | **Nonlinear support/contact analysis** | High technical value for difficult cases, but not needed to establish the screening product. |

A flashy AI RCA assistant ranks below deterministic evidence and qualified calculations. The engineering platform must first know exactly what was calculated, under what conditions and with what authority.

### Development roadmap

| Phase | Build | Qualification dependency / exit gate |
|---|---|---|
| **Foundation** | Source/method inventory; canonical data quantities; units; provenance; master architecture; authority states; generic calculation result contract. | No mechanism production claims. Architecture review complete. |
| **FIV–FIT gold vertical** | FIT validation, applicability, pure kernel, assessment, evidence, sensitivity, benchmarks, line workspace. | `QUALIFIED → SCREENING_AUTHORITY` for explicit FIT scope. |
| **Facility screening** | Project/facility/line/case model; Excel/API import; batch orchestration; completeness; dashboard; findings; initial 3D mapping. | Batch results demonstrated identical to single calculations. |
| **Additional mechanisms** | AIV, FIP, SBC first; then cavitation/flashing, surge and multiphase/slug according to business demand/method readiness. | Each mechanism separately passes its own qualification gate. |
| **Mitigation and scenario analysis** | Baseline/modification, action register, recalculation, verification workflow. | Approved scenario provenance and no result mutation. |
| **Field measurements** | Sessions, calibration, raw waveform storage, signal products, model locations, AM-like anomaly linkage. | Measurement pipeline qualification and traceable signal processing. |
| **RCA** | Hypothesis/evidence graph, expected signatures, correlation tools, engineer sign-off. | Explicit separation between automated evidence and engineering conclusion. |
| **Advanced/nonlinear dynamics** | Modal/ODS integration, gapped/contact supports, nonlinear time histories, detailed transient coupling. | Solver-specific verification/validation; never inherit screening authority. |

AIV, FIP and SBC are sensible early additions because the public EI ecosystem already treats them as well-established distinct mechanisms, and the source/discontinuity/branch data relationships will exercise the canonical architecture. citeturn19view0turn19view4

Slug/multiphase and full surge should not simply be “another LOF formula.” Wood's detailed multiphase workflow involves time-dependent fluid forces feeding structural response, illustrating why these become significantly heavier engineering kernels. citeturn19view3

### Specific first FIT production PR sequence

| PR | Deliverable | Exit condition |
|---:|---|---|
| **PR-A** | Terminology decision and method/source register. Define FIT versus FIP; define exact intended EI revision and licensed source. | Vibration technical authority signs method scope. **No equations yet.** |
| **PR-B** | Engineering quantity/unit library and `DataValue` provenance type. | SI/US conversion tests; pressure-reference and temperature rules defined. |
| **PR-C** | Canonical FIT input schema and `validateFitInput()`. | Invalid/missing input tests complete; no hidden defaults. |
| **PR-D** | `evaluateFitApplicability()` and explicit applicability rule IDs. | Out-of-scope cases fail closed independently of calculation. |
| **PR-E** | Engineering master loader, immutable revisions and source/master hashing. | Qualified records cannot mutate; missing record blocks execution. |
| **PR-F** | Pure `calculateFit()` kernel returning hydraulics and all qualified intermediates. | Independent hand/reference benchmark parity. **No assessment logic embedded.** |
| **PR-G** | Separate `assessFit()` criterion package. | Boundary tests immediately below/at/above each qualified criterion. |
| **PR-H** | Generic result/evidence contract and immutable `CalculationSnapshot`. | Full result reproducible from pinned inputs/master/kernel. |
| **PR-I** | Qualification benchmark suite: nominal, low/high, boundaries, geometry/span, cases, invalid/applicability, SI/US, deterministic/fail-closed. | Independent checker approves dossier. |
| **PR-J** | `runFitSensitivity()` including case and flow sweeps. | Results derived exclusively from the same qualified kernel. |
| **PR-K** | Batch mechanism adapter + operating-case orchestration. | Batch versus synchronous result digests identical. |
| **PR-L** | First Vibration Integrity line workspace: Result → Why → Evidence. | UX exposes missing data, applicability and authority without raw-form overload. |
| **PR-M** | Facility dashboard and Excel/API import. | 100–1,000-line regression/performance dataset; incremental recomputation verified. |
| **PR-N** | Qualification release and authority configuration. | Kernel becomes `SCREENING_AUTHORITY` only after signed approval. |

### What deliberately should not be built in the first FIT production vertical

Do **not** initially build:

- a universal cross-mechanism LOF or “vibration risk score”;
- AIV equations hidden inside the FIT kernel;
- FIP dead-leg resonance under the FIT calculation ID;
- automatic natural-frequency or damping defaults;
- a generic SBC factor shared across all parent excitation;
- an AI RCA engine;
- full nonlinear contact analysis;
- automatic as-built support assumptions from 3D;
- a detailed transient solver;
- a complete measurement-management platform;
- a universal mitigation recommender;
- a `DESIGN_AUTHORITY` designation for a screening correlation;
- a second independent calculation implementation inside PDF/report code.

The first FIT release should establish **patterns**, not pre-implement the entire future platform.

### Principal unresolved engineering questions

The largest immediate risk is the **Energy Institute third edition transition**. Public 2026 conference information says the new edition has been approved and is being prepared for publication, while EI's current product page still lists the second edition from January 2008. The team should obtain the legally published third edition as soon as available and perform a formal method-delta assessment before committing the 2008 FIT implementation to a long support life. citeturn16search0turn16search9

A second unresolved issue is exact **method licensing and redistribution rights**. The platform may expose its own calculated results and evidence, but source text, tables, coefficients and equation representations from paid standards/guidance must be handled according to the relevant licenses. Qualification should therefore begin with a source/IP register rather than copying existing spreadsheets.

A third issue is **multiphase applicability of the initial FIT correlation**. Public commercial material describes FIT across liquid and gaseous service and Veridian covers multiphase mechanisms, but the exact boundary between an acceptable broadband FIT screen and a dedicated multiphase/slug method must be taken from the licensed method revision rather than inferred from marketing pages. citeturn19view0turn19view3

A fourth issue is support authority. Maximum unsupported span is a practical screening input, confirmed by Wood for FIT/multiphase screening, but future detailed assessment needs actual support condition, stiffness, gap/contact behavior and potentially nonlinear states. The platform needs both concepts without pretending one is the other. citeturn20view0

A fifth issue is **SBC semantics**. SBC needs its own structural susceptibility model, but it should remain linked to the excitation mechanism acting on the parent system. This will avoid a common conceptual error in which “SBC vibration” becomes treated as an independent source instead of a vulnerable branch structure driven by FIT, machinery, pulsation or transients. Wood's public description strongly emphasizes local branch resonance and parent-pipe excitation. citeturn19view4

A sixth issue is consequence/risk integration. EI-style LOF can feed an operator-defined criticality/risk-management process, but the platform should not bake one universal business consequence matrix into the calculation kernel. Consequence classification is asset/operator context; excitation calculation is physics/empirical engineering.

### Final recommendation: exactly what the first FIV implementation should establish

Build **one narrow, exceptionally well-qualified FIT vertical** with the following end-to-end path:

```text
Facility / line / operating-case data
              ↓
Typed SI quantities + provenance
              ↓
FIT input validation
              ↓
FIT applicability
              ↓
Pinned qualified method/master revision
              ↓
Pure deterministic FIT calculation
              ↓
Separate FIT screening assessment
              ↓
Governing case/location
              ↓
Immutable CalculationSnapshot
              ↓
Human-readable explanation
              ↓
Machine-readable evidence
              ↓
Line workspace
              ↓
Facility batch screening
              ↓
Finding
              ↓
Modification scenario
              ↓
Reassessment / verification
```

Make that implementation prove the platform's permanent engineering principles:

```text
No silent defaults.
No equation in the UI.
No mutable qualified master.
No "latest" dependency in a result.
No applicability hidden inside pass/fail.
No assessment hidden inside calculation.
No mechanism-independent empirical authority.
No raw LOF treated as universal probability.
No report-specific calculation path.
No qualification implied by implementation.
No design authority implied by screening.
```

Use the first FIT vertical to prove that a result can answer, deterministically and years later:

```text
What was calculated?
Why was this method applicable?
Which physical inputs were used?
Where did those inputs come from?
What was derived?
Which correlation revision ran?
Which master records were used?
Which units did the correlation use?
Which case and location governed?
Which acceptance criterion was applied?
What software produced it?
Was that software qualified?
What engineering authority did the result have?
What changed when the line or process was modified?
```

Only once that pattern is qualified should AIV, FIP, SBC and the other mechanisms be added—**each as a separately governed engineering authority behind the same infrastructure**.

That creates the intended progression:

```text
Qualified FIT calculation
          ↓
Multi-mechanism vibration screening
          ↓
Facility integrity management
          ↓
Field measurement correlation
          ↓
Structured engineering RCA
          ↓
Advanced / nonlinear vibration assessment
```

Veridian's public benchmark demonstrates the value of integrating screening, facility prioritization, measurements, anomalies, mitigation and verification. The opportunity to exceed that benchmark is to make those same engineering workflows **API-native, deterministic, source-traceable, method-versioned, scenario-aware, 3D-addressable and fully explainable**, while refusing to blur fundamentally different vibration mechanisms into one convenient but technically misleading score. citeturn21search3turn21search0turn21search1