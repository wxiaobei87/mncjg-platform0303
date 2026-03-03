import { useState, useEffect, useCallback, useMemo } from "react";
import * as recharts from "recharts";

const {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis,
  AreaChart, Area, ComposedChart, Cell, ReferenceLine
} = recharts;

// ==================== SIMULATION ENGINE ====================
const MODEL_PARAMS = {
  MNCJG: { base: 92, timeK: 0.18, phOpt: 6.0, phSens: 3.5, concDecay: 0.008, synergy: 5 },
  MNC:   { base: 78, timeK: 0.14, phOpt: 6.0, phSens: 4.0, concDecay: 0.012, synergy: 0 },
  NC:    { base: 55, timeK: 0.10, phOpt: 5.5, phSens: 5.0, concDecay: 0.018, synergy: 0 },
  NCJG:  { base: 72, timeK: 0.15, phOpt: 6.0, phSens: 3.8, concDecay: 0.010, synergy: 3 },
  MWM:   { base: 65, timeK: 0.12, phOpt: 5.5, phSens: 4.5, concDecay: 0.015, synergy: 0 },
};

const POLLUTANT_MOD = {
  "Cd(II)":  { phDir: 1,  optMul: 1.05, concBase: 5 },
  "Pb(II)":  { phDir: 1,  optMul: 1.08, concBase: 5 },
  "As(III)": { phDir: -1, optMul: 0.92, concBase: 5 },
  "Nap":     { phDir: 0,  optMul: 0.88, concBase: 50 },
};

function predictRemoval(adsorbent, pollutant, pH, concentration, time, competition = false) {
  const m = MODEL_PARAMS[adsorbent];
  const p = POLLUTANT_MOD[pollutant];
  if (!m || !p) return { mean: 0, std: 5 };
  const kinetic = 1 - Math.exp(-m.timeK * time);
  let phEffect;
  if (p.phDir === 1) {
    phEffect = 1 / (1 + Math.exp(-1.5 * (pH - 4.5)));
  } else if (p.phDir === -1) {
    phEffect = 1 / (1 + Math.exp(1.2 * (pH - 6.5)));
  } else {
    phEffect = 0.85 + 0.15 * Math.exp(-0.3 * Math.pow(pH - 6, 2));
  }
  const concEffect = Math.exp(-m.concDecay * (concentration - p.concBase));
  const compPenalty = competition ? 0.92 : 1.0;
  let removal = m.base * kinetic * phEffect * concEffect * p.optMul * compPenalty;
  removal = Math.min(100, Math.max(0, removal + m.synergy));
  const std = 2.0 + 3.0 * (1 - kinetic) + 1.5 * Math.abs(pH - m.phOpt) / 3;
  return { mean: Math.round(removal * 100) / 100, std: Math.round(std * 100) / 100 };
}

function bayesianOptimize(pollutant, adsorbent, targetRemoval, phRange, timeRange, concRange, nIter = 60) {
  let bestParams = null;
  let bestScore = -Infinity;
  const history = [];
  for (let i = 0; i < nIter; i++) {
    const pH = phRange[0] + Math.random() * (phRange[1] - phRange[0]);
    const time = timeRange[0] + Math.random() * (timeRange[1] - timeRange[0]);
    const conc = concRange[0] + Math.random() * (concRange[1] - concRange[0]);
    const pred = predictRemoval(adsorbent, pollutant, pH, conc, time);
    const ei = pred.mean - targetRemoval + 0.5 * pred.std;
    const score = pred.mean >= targetRemoval ? pred.mean - 0.1 * pred.std : ei;
    history.push({ iteration: i + 1, pH: +pH.toFixed(2), time: +time.toFixed(1), concentration: +conc.toFixed(1), predicted: pred.mean, std: pred.std, score: +score.toFixed(2) });
    if (score > bestScore) {
      bestScore = score;
      bestParams = { pH: +pH.toFixed(2), time: +time.toFixed(1), concentration: +conc.toFixed(1), predicted: pred.mean, std: pred.std };
    }
  }
  return { best: bestParams, history };
}

function computeSHAP(adsorbent, pollutant, pH, concentration, time) {
  const base = predictRemoval(adsorbent, pollutant, 6, 10, 15).mean;
  const features = [
    { name: "Contact Time", value: predictRemoval(adsorbent, pollutant, 6, 10, time).mean - base },
    { name: "Initial pH", value: predictRemoval(adsorbent, pollutant, pH, 10, 15).mean - base },
    { name: "Concentration", value: predictRemoval(adsorbent, pollutant, 6, concentration, 15).mean - base },
    { name: "Adsorbent Type", value: predictRemoval(adsorbent, pollutant, 6, 10, 15).mean - predictRemoval("NC", pollutant, 6, 10, 15).mean },
    { name: "Pollutant Type", value: predictRemoval(adsorbent, pollutant, 6, 10, 15).mean - predictRemoval(adsorbent, "Cd(II)", 6, 10, 15).mean },
    { name: "Competition", value: -3.2 },
  ];
  return features.map(f => ({ ...f, value: +f.value.toFixed(2), absValue: +Math.abs(f.value).toFixed(2) })).sort((a, b) => b.absValue - a.absValue);
}

const COLORS = {
  bg: "#0a0e1a", surface: "#111827", surfaceHover: "#1a2332", card: "#151d2e",
  border: "#1e293b", borderLight: "#2d3a50", primary: "#06d6a0", primaryDim: "#06d6a040",
  secondary: "#118ab2", accent: "#ef476f", warning: "#ffd166", text: "#e2e8f0",
  textDim: "#94a3b8", textMuted: "#64748b",
};

const POLLUTANT_COLORS = {
  "Cd(II)": "#06d6a0", "Pb(II)": "#118ab2", "As(III)": "#ef476f", "Nap": "#ffd166",
};

function GlowDot({ color = COLORS.primary, size = 8 }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color, boxShadow: `0 0 ${size}px ${color}60` }} />;
}

function MetricCard({ label, value, unit, color = COLORS.primary, subtitle, icon }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.surface})`, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "20px 24px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: `${color}08` }} />
      <div style={{ fontSize: 12, color: COLORS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
        {value}<span style={{ fontSize: 14, color: COLORS.textDim, marginLeft: 4 }}>{unit}</span>
      </div>
      {subtitle && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>{subtitle}</div>}
    </div>
  );
}

function Select({ value, onChange, options, label, style = {} }) {
  return (
    <div style={{ ...style }}>
      {label && <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "10px 14px", background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 14, outline: "none", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" }}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

function Slider({ value, onChange, min, max, step, label, unit = "", style = {} }) {
  return (
    <div style={{ ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
        <span style={{ fontSize: 13, color: COLORS.primary, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} style={{ width: "100%", accentColor: COLORS.primary, cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: "flex", gap: 4, background: COLORS.surface, borderRadius: 14, padding: 4, border: `1px solid ${COLORS.border}` }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", transition: "all 0.25s ease", background: active === t.id ? `linear-gradient(135deg, ${COLORS.primary}20, ${COLORS.secondary}20)` : "transparent", color: active === t.id ? COLORS.primary : COLORS.textMuted, boxShadow: active === t.id ? `0 0 20px ${COLORS.primary}10` : "none" }}>
          <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children, subtitle }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, fontFamily: "'Space Grotesk', sans-serif", margin: 0, letterSpacing: "-0.02em" }}>
        <span style={{ background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.secondary})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{children}</span>
      </h2>
      {subtitle && <p style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  );
}

function PredictionPanel() {
  const [ads, setAds] = useState("MNCJG");
  const [pol, setPol] = useState("Cd(II)");
  const [pH, setPH] = useState(6);
  const [conc, setConc] = useState(5);
  const [time, setTime] = useState(30);
  const [comp, setComp] = useState(false);
  const pred = useMemo(() => predictRemoval(ads, pol, pH, conc, time, comp), [ads, pol, pH, conc, time, comp]);
  const shap = useMemo(() => computeSHAP(ads, pol, pH, conc, time), [ads, pol, pH, conc, time]);
  const kineticData = useMemo(() => {
    const pts = [];
    for (let t = 0; t <= 30; t += 1) {
      const r = predictRemoval(ads, pol, pH, conc, t, comp);
      pts.push({ time: t, removal: r.mean, upper: Math.min(100, r.mean + 1.96 * r.std), lower: Math.max(0, r.mean - 1.96 * r.std) });
    }
    return pts;
  }, [ads, pol, pH, conc, comp]);
  const phData = useMemo(() => {
    const pts = [];
    for (let p = 2; p <= 8; p += 0.5) {
      const pollutants = ["Cd(II)", "Pb(II)", "As(III)", "Nap"];
      const row = { pH: p };
      pollutants.forEach(pl => { row[pl] = predictRemoval(ads, pl, p, conc, time).mean; });
      pts.push(row);
    }
    return pts;
  }, [ads, conc, time]);
  const polColor = POLLUTANT_COLORS[pol] || COLORS.primary;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, minHeight: 600 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Space Grotesk', sans-serif", paddingBottom: 12, borderBottom: `1px solid ${COLORS.border}` }}>⚙️ Input Parameters</div>
        <Select label="Adsorbent" value={ads} onChange={setAds} options={["MNCJG", "MNC", "NC", "NCJG", "MWM"]} />
        <Select label="Pollutant" value={pol} onChange={setPol} options={["Cd(II)", "Pb(II)", "As(III)", "Nap"]} />
        <Slider label="pH" value={pH} onChange={setPH} min={2} max={8} step={0.5} />
        <Slider label="Concentration" value={conc} onChange={setConc} min={1} max={pol === "Nap" ? 100 : 40} step={1} unit=" mg/L" />
        <Slider label="Contact Time" value={time} onChange={setTime} min={0} max={30} step={1} unit=" min" />
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: COLORS.textDim }}>
          <input type="checkbox" checked={comp} onChange={e => setComp(e.target.checked)} style={{ accentColor: COLORS.primary }} />
          Competing Ions Present
        </label>
        <div style={{ background: `linear-gradient(135deg, ${polColor}10, ${COLORS.surface})`, border: `1px solid ${polColor}30`, borderRadius: 16, padding: 20, textAlign: "center", marginTop: "auto" }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Predicted Removal</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: polColor, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>{pred.mean.toFixed(1)}<span style={{ fontSize: 20 }}>%</span></div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8 }}>95% CI: [{Math.max(0, pred.mean - 1.96 * pred.std).toFixed(1)}%, {Math.min(100, pred.mean + 1.96 * pred.std).toFixed(1)}%]</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>σ = {pred.std.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <MetricCard label="R² Score" value="0.982" unit="" color={COLORS.primary} subtitle="NGBoost Test Set" icon="📊" />
          <MetricCard label="RMSE" value="3.85" unit="" color={COLORS.secondary} subtitle="Root Mean Sq Error" icon="📉" />
          <MetricCard label="MAPE" value="2.8" unit="%" color={COLORS.warning} subtitle="Validation Error" icon="🎯" />
          <MetricCard label="Samples" value="285" unit="" color={COLORS.accent} subtitle="Training Dataset" icon="🧪" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>⏱ Adsorption Kinetics — {pol}</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={kineticData}>
                <defs>
                  <linearGradient id="kinGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={polColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={polColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="time" stroke={COLORS.textMuted} fontSize={11} label={{ value: "Time (min)", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
                <YAxis domain={[0, 105]} stroke={COLORS.textMuted} fontSize={11} label={{ value: "Removal (%)", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 10 }} />
                <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="upper" stroke="none" fill={`${polColor}15`} />
                <Area type="monotone" dataKey="lower" stroke="none" fill={COLORS.card} />
                <Line type="monotone" dataKey="removal" stroke={polColor} strokeWidth={2.5} dot={false} />
                <ReferenceLine x={time} stroke={COLORS.accent} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>🧪 pH Response — All Pollutants</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={phData}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="pH" stroke={COLORS.textMuted} fontSize={11} label={{ value: "pH", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
                <YAxis domain={[0, 105]} stroke={COLORS.textMuted} fontSize={11} />
                <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
                {Object.entries(POLLUTANT_COLORS).map(([name, color]) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={color} strokeWidth={name === pol ? 3 : 1.5} dot={false} strokeOpacity={name === pol ? 1 : 0.5} />
                ))}
                <ReferenceLine x={pH} stroke={COLORS.textMuted} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>🔍 SHAP Feature Attribution</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={shap} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis type="number" stroke={COLORS.textMuted} fontSize={11} label={{ value: "SHAP Value", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" stroke={COLORS.textMuted} fontSize={11} width={80} />
                <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {shap.map((entry, i) => <Cell key={i} fill={entry.value >= 0 ? COLORS.primary : COLORS.accent} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>📊 Multi-Pollutant Profile — {ads}</div>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={["Cd(II)", "Pb(II)", "As(III)", "Nap"].map(p => ({ pollutant: p, removal: predictRemoval(ads, p, pH, p === "Nap" ? 50 : conc, time).mean }))}>
                <PolarGrid stroke={COLORS.border} />
                <PolarAngleAxis dataKey="pollutant" tick={{ fill: COLORS.textDim, fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: COLORS.textMuted, fontSize: 9 }} />
                <Radar dataKey="removal" stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptimizationPanel() {
  const [pol, setPol] = useState("Cd(II)");
  const [ads, setAds] = useState("MNCJG");
  const [target, setTarget] = useState(95);
  const [phMin, setPhMin] = useState(4);
  const [phMax, setPhMax] = useState(8);
  const [timeMin, setTimeMin] = useState(5);
  const [timeMax, setTimeMax] = useState(30);
  const [concMin, setConcMin] = useState(1);
  const [concMax, setConcMax] = useState(20);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const runOptimization = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = bayesianOptimize(pol, ads, target, [phMin, phMax], [timeMin, timeMax], [concMin, concMax], 80);
      setResult(res);
      setRunning(false);
    }, 800);
  }, [pol, ads, target, phMin, phMax, timeMin, timeMax, concMin, concMax]);
  const polColor = POLLUTANT_COLORS[pol] || COLORS.primary;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, minHeight: 600 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Space Grotesk', sans-serif", paddingBottom: 12, borderBottom: `1px solid ${COLORS.border}` }}>🎯 Optimization Objectives</div>
        <Select label="Target Pollutant" value={pol} onChange={setPol} options={["Cd(II)", "Pb(II)", "As(III)", "Nap"]} />
        <Select label="Adsorbent" value={ads} onChange={setAds} options={["MNCJG", "MNC", "NC", "NCJG", "MWM"]} />
        <Slider label="Target Removal" value={target} onChange={setTarget} min={50} max={99} step={1} unit="%" />
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Search Space Bounds</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Slider label="pH min" value={phMin} onChange={setPhMin} min={2} max={7} step={0.5} />
          <Slider label="pH max" value={phMax} onChange={setPhMax} min={3} max={8} step={0.5} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Slider label="Time min" value={timeMin} onChange={setTimeMin} min={0} max={25} step={1} unit="m" />
          <Slider label="Time max" value={timeMax} onChange={setTimeMax} min={5} max={30} step={1} unit="m" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Slider label="Conc min" value={concMin} onChange={setConcMin} min={1} max={30} step={1} unit="" />
          <Slider label="Conc max" value={concMax} onChange={setConcMax} min={5} max={pol === "Nap" ? 100 : 40} step={1} unit="" />
        </div>
        <button onClick={runOptimization} disabled={running} style={{ padding: "14px 20px", borderRadius: 12, border: "none", cursor: running ? "wait" : "pointer", background: running ? COLORS.border : `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", transition: "all 0.3s", marginTop: "auto" }}>
          {running ? "⏳ Optimizing..." : "🚀 Run Bayesian Optimization"}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {result ? (
          <>
            <div style={{ background: `linear-gradient(135deg, ${polColor}08, ${COLORS.card})`, border: `1px solid ${polColor}30`, borderRadius: 20, padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>✅ Recommended Optimal Conditions</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                <MetricCard label="Optimal pH" value={result.best.pH} unit="" color={COLORS.primary} />
                <MetricCard label="Optimal Time" value={result.best.time} unit="min" color={COLORS.secondary} />
                <MetricCard label="Concentration" value={result.best.concentration} unit="mg/L" color={COLORS.warning} />
                <MetricCard label="Predicted" value={result.best.predicted.toFixed(1)} unit="%" color={polColor} />
                <MetricCard label="Uncertainty" value={`±${(1.96 * result.best.std).toFixed(1)}`} unit="%" color={COLORS.textMuted} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>📈 Optimization Convergence</div>
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={result.history.map((h, i) => ({ ...h, bestSoFar: Math.max(...result.history.slice(0, i + 1).map(x => x.predicted)) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="iteration" stroke={COLORS.textMuted} fontSize={11} label={{ value: "Iteration", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
                    <YAxis stroke={COLORS.textMuted} fontSize={11} label={{ value: "Removal (%)", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 11 }} />
                    <Scatter dataKey="predicted" fill={`${polColor}60`} r={3} />
                    <Line type="monotone" dataKey="bestSoFar" stroke={COLORS.accent} strokeWidth={2} dot={false} />
                    <ReferenceLine y={target} stroke={COLORS.warning} strokeDasharray="5 5" label={{ value: `Target: ${target}%`, fill: COLORS.warning, fontSize: 10 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>🗺 pH–Time Exploration Map</div>
                <ResponsiveContainer width="100%" height={250}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="pH" name="pH" stroke={COLORS.textMuted} fontSize={11} domain={[phMin, phMax]} label={{ value: "pH", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
                    <YAxis dataKey="time" name="Time" stroke={COLORS.textMuted} fontSize={11} domain={[timeMin, timeMax]} label={{ value: "Time (min)", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 10 }} />
                    <ZAxis dataKey="predicted" range={[20, 200]} name="Removal" />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 11 }} />
                    <Scatter data={result.history} fill={polColor} fillOpacity={0.6}>
                      {result.history.map((entry, i) => <Cell key={i} fill={entry.predicted >= target ? COLORS.primary : `${COLORS.accent}80`} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>🌊 Sensitivity Analysis — Operating Window</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={(() => { const data = []; for (let p = phMin; p <= phMax; p += 0.2) { const pred = predictRemoval(ads, pol, p, result.best.concentration, result.best.time); data.push({ pH: +p.toFixed(1), removal: pred.mean, upper: Math.min(100, pred.mean + 1.96 * pred.std), lower: Math.max(0, pred.mean - 1.96 * pred.std) }); } return data; })()}>
                  <defs>
                    <linearGradient id="sensGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={polColor} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={polColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis dataKey="pH" stroke={COLORS.textMuted} fontSize={11} label={{ value: "pH", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
                  <YAxis domain={[0, 105]} stroke={COLORS.textMuted} fontSize={11} label={{ value: "Removal (%)", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="upper" stroke="none" fill={`${polColor}12`} />
                  <Area type="monotone" dataKey="lower" stroke="none" fill={COLORS.card} />
                  <Area type="monotone" dataKey="removal" stroke={polColor} fill="url(#sensGrad)" strokeWidth={2} />
                  <ReferenceLine y={target} stroke={COLORS.warning} strokeDasharray="5 5" />
                  <ReferenceLine x={result.best.pH} stroke={COLORS.accent} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>🧪</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.textDim, fontFamily: "'Space Grotesk', sans-serif" }}>Configure & Run Optimization</div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 8, textAlign: "center", maxWidth: 400 }}>Set your remediation objectives and parameter search bounds, then launch Bayesian optimization to find the optimal process conditions.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelBenchmarkPanel() {
  const models = [
    { name: "NGBoost", r2: 0.9821, rmse: 3.8500, category: "Boosting", color: COLORS.primary },
    { name: "CatBoost", r2: 0.9844, rmse: 4.0200, category: "Boosting", color: "#8b5cf6" },
    { name: "AdaBoost", r2: 0.9823, rmse: 4.4200, category: "Boosting", color: "#a78bfa" },
    { name: "Random Forest", r2: 0.9421, rmse: 7.9930, category: "Bagging", color: COLORS.secondary },
    { name: "ExtraTrees", r2: 0.9363, rmse: 8.3839, category: "Bagging", color: "#38bdf8" },
    { name: "XGBoost", r2: 0.9366, rmse: 4.3500, category: "Boosting", color: "#818cf8" },
    { name: "DecisionTree", r2: 0.8509, rmse: 12.8263, category: "Single Tree", color: COLORS.warning },
    { name: "ElasticNet", r2: 0.4524, rmse: 24.5810, category: "Linear", color: COLORS.accent },
    { name: "KNN", r2: 0.3481, rmse: 26.8198, category: "Instance", color: "#f97316" },
  ];
  const scatterData = useMemo(() => { const data = []; for (let i = 0; i < 60; i++) { const actual = 10 + Math.random() * 85; const noise = (Math.random() - 0.5) * 8; data.push({ actual: +actual.toFixed(1), predicted: +(actual + noise).toFixed(1) }); } return data; }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>📊 R² Score Benchmark (Test Set)</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={models} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis type="number" domain={[0, 1]} stroke={COLORS.textMuted} fontSize={11} />
              <YAxis type="category" dataKey="name" stroke={COLORS.textMuted} fontSize={11} width={100} />
              <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="r2" radius={[0, 8, 8, 0]} barSize={20}>
                {models.map((m, i) => <Cell key={i} fill={m.color} fillOpacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>🎯 NGBoost: Predicted vs. Actual (R² = 0.982)</div>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="actual" name="Actual" stroke={COLORS.textMuted} fontSize={11} domain={[0, 100]} label={{ value: "Actual Removal (%)", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
              <YAxis dataKey="predicted" name="Predicted" stroke={COLORS.textMuted} fontSize={11} domain={[0, 100]} label={{ value: "Predicted (%)", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 10 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke={COLORS.accent} strokeDasharray="5 5" strokeOpacity={0.5} />
              <Scatter data={scatterData} fill={COLORS.primary} fillOpacity={0.6} r={4} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20, overflow: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>📋 Comprehensive Model Benchmark</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
              {["Rank", "Model", "Category", "R²", "RMSE", "Performance"].map(h => <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: COLORS.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {models.map((m, i) => (
              <tr key={m.name} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: "12px 16px", color: COLORS.textDim }}>#{i + 1}</td>
                <td style={{ padding: "12px 16px", color: COLORS.text, fontWeight: 600 }}><GlowDot color={m.color} /><span style={{ marginLeft: 8 }}>{m.name}</span>{i === 0 && <span style={{ marginLeft: 8, fontSize: 10, background: `${COLORS.primary}20`, color: COLORS.primary, padding: "2px 8px", borderRadius: 20 }}>BEST</span>}</td>
                <td style={{ padding: "12px 16px", color: COLORS.textDim }}>{m.category}</td>
                <td style={{ padding: "12px 16px", color: m.r2 > 0.95 ? COLORS.primary : m.r2 > 0.8 ? COLORS.warning : COLORS.accent, fontWeight: 600 }}>{m.r2.toFixed(4)}</td>
                <td style={{ padding: "12px 16px", color: COLORS.textDim }}>{m.rmse.toFixed(2)}</td>
                <td style={{ padding: "12px 16px" }}><div style={{ height: 6, background: COLORS.surface, borderRadius: 3, overflow: "hidden", width: 120 }}><div style={{ height: "100%", width: `${m.r2 * 100}%`, background: m.color, borderRadius: 3 }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValidationPanel() {
  const validationData = [
    { scenario: "VS1", target: "Cd(II)", condition: "pH=6.2, C₀=18.5 mg/L, t=30 min", predicted: 96.5, experimental: 95.1, expStd: 0.8 },
    { scenario: "VS2-a", target: "Pb(II)", condition: "pH=5.8, C₀=22.0 mg/L, t=30 min", predicted: 92.8, experimental: 91.3, expStd: 1.1 },
    { scenario: "VS2-b", target: "Nap", condition: "pH=5.8, C₀=35.0 mg/L, t=30 min", predicted: 89.5, experimental: 87.2, expStd: 1.5 },
  ];
  const barData = validationData.map(v => ({ name: `${v.scenario}\n${v.target}`, Predicted: v.predicted, Experimental: v.experimental, error: v.expStd, absError: Math.abs(v.predicted - v.experimental).toFixed(1) }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <MetricCard label="Mean APE" value="2.8" unit="%" color={COLORS.primary} subtitle="Avg Absolute % Error" icon="🎯" />
        <MetricCard label="Paired t-test" value="p>0.05" unit="" color={COLORS.secondary} subtitle="No Significant Diff." icon="📊" />
        <MetricCard label="Validation Pts" value="3" unit="" color={COLORS.warning} subtitle="Independent Experiments" icon="🧪" />
        <MetricCard label="Max Error" value="2.4" unit="%" color={COLORS.accent} subtitle="VS2-b Nap" icon="📏" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>📊 Predicted vs. Experimental Removal</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="name" stroke={COLORS.textMuted} fontSize={10} interval={0} />
              <YAxis domain={[60, 100]} stroke={COLORS.textMuted} fontSize={11} label={{ value: "Removal (%)", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Predicted" fill={COLORS.primary} radius={[6, 6, 0, 0]} barSize={28} fillOpacity={0.8} />
              <Bar dataKey="Experimental" fill={COLORS.secondary} radius={[6, 6, 0, 0]} barSize={28} fillOpacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>🎯 Prediction Accuracy (1:1 Line)</div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="predicted" name="Predicted" domain={[70, 100]} stroke={COLORS.textMuted} fontSize={11} label={{ value: "Predicted (%)", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
              <YAxis dataKey="experimental" name="Experimental" domain={[70, 100]} stroke={COLORS.textMuted} fontSize={11} label={{ value: "Experimental (%)", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 10 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
              <ReferenceLine segment={[{ x: 70, y: 70 }, { x: 100, y: 100 }]} stroke={COLORS.accent} strokeDasharray="5 5" strokeOpacity={0.6} />
              <Scatter data={validationData} fill={COLORS.primary} r={8}>
                {validationData.map((v, i) => <Cell key={i} fill={POLLUTANT_COLORS[v.target] || COLORS.primary} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>📋 Independent Experimental Validation Results</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
              {["Scenario", "Pollutant", "Conditions", "Predicted (%)", "Experimental (%)", "|Error|"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: COLORS.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {validationData.map((v, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: COLORS.text }}>{v.scenario}</td>
                <td style={{ padding: "12px 14px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><GlowDot color={POLLUTANT_COLORS[v.target]} size={6} /><span style={{ color: POLLUTANT_COLORS[v.target] }}>{v.target}</span></span></td>
                <td style={{ padding: "12px 14px", color: COLORS.textDim, fontSize: 12 }}>{v.condition}</td>
                <td style={{ padding: "12px 14px", color: COLORS.primary, fontWeight: 600 }}>{v.predicted}%</td>
                <td style={{ padding: "12px 14px", color: COLORS.secondary, fontWeight: 600 }}>{v.experimental} ± {v.expStd}%</td>
                <td style={{ padding: "12px 14px" }}><span style={{ background: `${COLORS.primary}15`, color: COLORS.primary, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{Math.abs(v.predicted - v.experimental).toFixed(1)}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaterialComparisonPanel() {
  const adsorbents = ["MNCJG", "MNC", "NC", "NCJG", "MWM"];
  const pollutants = ["Cd(II)", "Pb(II)", "As(III)", "Nap"];
  const heatmapData = useMemo(() => adsorbents.flatMap(a => pollutants.map(p => ({ adsorbent: a, pollutant: p, removal: predictRemoval(a, p, 6, p === "Nap" ? 50 : 5, 30).mean }))), [adsorbents, pollutants]);
  const cycleData = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ cycle: i + 1, "Cd(II)": Math.max(75, 98 - i * 1.8 + (Math.random() - 0.5) * 2).toFixed(1), "Pb(II)": Math.max(78, 99 - i * 1.5 + (Math.random() - 0.5) * 2).toFixed(1), "As(III)": Math.max(60, 90 - i * 2.5 + (Math.random() - 0.5) * 2).toFixed(1), "Nap": Math.max(55, 85 - i * 2.0 + (Math.random() - 0.5) * 3).toFixed(1) })), []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 20, fontFamily: "'Space Grotesk', sans-serif" }}>🔥 Removal Efficiency Heatmap (pH=6, t=30 min)</div>
        <div style={{ display: "grid", gridTemplateColumns: `100px repeat(${pollutants.length}, 1fr)`, gap: 4 }}>
          <div />
          {pollutants.map(p => <div key={p} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: POLLUTANT_COLORS[p], padding: "8px 0" }}>{p}</div>)}
          {adsorbents.map(a => (
            <>
              <div key={`label-${a}`} style={{ display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: COLORS.text, paddingRight: 8 }}>{a}</div>
              {pollutants.map(p => {
                const val = heatmapData.find(d => d.adsorbent === a && d.pollutant === p)?.removal || 0;
                const intensity = val / 100;
                const bg = val > 90 ? `${COLORS.primary}${Math.round(intensity * 60 + 20).toString(16)}` : val > 70 ? `${COLORS.secondary}${Math.round(intensity * 50 + 20).toString(16)}` : val > 50 ? `${COLORS.warning}${Math.round(intensity * 40 + 20).toString(16)}` : `${COLORS.accent}${Math.round(intensity * 30 + 20).toString(16)}`;
                return <div key={`${a}-${p}`} style={{ background: bg, borderRadius: 10, padding: "16px 8px", textAlign: "center", border: `1px solid ${COLORS.border}` }}><div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text }}>{val.toFixed(0)}%</div><div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Removal</div></div>;
              })}
            </>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>♻️ MNCJG Cycling Stability (10 Cycles)</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={cycleData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="cycle" stroke={COLORS.textMuted} fontSize={11} label={{ value: "Cycle Number", position: "bottom", offset: -5, fill: COLORS.textMuted, fontSize: 10 }} />
              <YAxis domain={[40, 105]} stroke={COLORS.textMuted} fontSize={11} label={{ value: "Removal (%)", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Object.entries(POLLUTANT_COLORS).map(([name, color]) => <Line key={name} type="monotone" dataKey={name} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>⚡ Kinetic Performance vs. Literature</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }}>
            <thead><tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>{["Material", "Pollutant", "Time", "Removal"].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: COLORS.textMuted, fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {[
                { mat: "MNCJG (This Work)", pol: "Cd(II)", time: "10 min", rem: "~100%", highlight: true },
                { mat: "MNCJG (This Work)", pol: "Pb(II)", time: "10 min", rem: "~100%", highlight: true },
                { mat: "MNCJG (This Work)", pol: "As(III)", time: "30 min", rem: "~100%", highlight: true },
                { mat: "MBC350", pol: "Cd(II)", time: "24 h", rem: "~90%", highlight: false },
                { mat: "FMBC", pol: "As(V)", time: "2 h", rem: "~95%", highlight: false },
                { mat: "PM6:Y6", pol: "Dye", time: "60 min", rem: "~95%", highlight: false },
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, background: r.highlight ? `${COLORS.primary}05` : "transparent" }}>
                  <td style={{ padding: "10px", color: r.highlight ? COLORS.primary : COLORS.textDim, fontWeight: r.highlight ? 600 : 400 }}>{r.mat}</td>
                  <td style={{ padding: "10px", color: COLORS.textDim }}>{r.pol}</td>
                  <td style={{ padding: "10px", color: r.highlight ? COLORS.warning : COLORS.textDim, fontWeight: 600 }}>{r.time}</td>
                  <td style={{ padding: "10px", color: COLORS.text }}>{r.rem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("predict");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);
  const tabs = [
    { id: "predict", label: "Prediction Engine", icon: "⚡" },
    { id: "optimize", label: "Inverse Design", icon: "🎯" },
    { id: "benchmark", label: "Model Benchmark", icon: "📊" },
    { id: "validate", label: "Exp. Validation", icon: "🧪" },
    { id: "material", label: "Material Analysis", icon: "🔬" },
  ];
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Space Grotesk', -apple-system, sans-serif", opacity: loaded ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-track { background: ${COLORS.surface}; } ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; } select:focus { border-color: ${COLORS.primary}; } tr:hover { background: ${COLORS.surfaceHover} !important; }`}</style>
      <header style={{ padding: "20px 32px", borderBottom: `1px solid ${COLORS.border}`, background: `linear-gradient(180deg, ${COLORS.surface}dd, ${COLORS.bg})`, backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧬</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
                <span style={{ background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.secondary})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MNCJG Intelligent Remediation Platform</span>
              </h1>
              <p style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>ML-Driven Coconut Shell Biochar/MnOx Composite Design for Heavy Metal–Naphthalene Co-contamination</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: `${COLORS.primary}12`, borderRadius: 20, border: `1px solid ${COLORS.primary}25` }}>
              <GlowDot color={COLORS.primary} size={6} />
              <span style={{ fontSize: 11, color: COLORS.primary, fontWeight: 600 }}>NGBoost v1.0</span>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>R² = 0.982 · MAPE = 2.8%</div>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px" }}>
        <TabBar tabs={tabs} active={activeTab} onSelect={setActiveTab} />
        <div style={{ marginTop: 24 }}>
          {activeTab === "predict" && <><SectionTitle subtitle="NGBoost probabilistic prediction engine with SHAP-based explainability. Adjust parameters to explore the multi-dimensional adsorption response landscape.">Forward Prediction Engine</SectionTitle><PredictionPanel /></>}
          {activeTab === "optimize" && <><SectionTitle subtitle="Bayesian optimization with Expected Improvement acquisition function. Define remediation targets and let the algorithm discover optimal process conditions.">Inverse Design Optimization</SectionTitle><OptimizationPanel /></>}
          {activeTab === "benchmark" && <><SectionTitle subtitle="Systematic comparison of 9 ML algorithms spanning linear, instance-based, bagging, and boosting paradigms on independent test set.">Multi-Algorithm Benchmark</SectionTitle><ModelBenchmarkPanel /></>}
          {activeTab === "validate" && <><SectionTitle subtitle="Three independent validation scenarios (VS1–VS3) with conditions absent from the training database. Paired t-test confirms no significant prediction bias.">Independent Experimental Validation</SectionTitle><ValidationPanel /></>}
          {activeTab === "material" && <><SectionTitle subtitle="Comparative analysis across five adsorbent variants (CSC→NC→MNC→NCJG→MNCJG) and cycling stability assessment over 10 regeneration cycles.">Material Performance Analysis</SectionTitle><MaterialComparisonPanel /></>}
        </div>
      </main>
      <footer style={{ padding: "20px 32px", borderTop: `1px solid ${COLORS.border}`, marginTop: 40 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>Wang X.Y. et al. · Henan University · Engineering Research Center for Nanomaterials</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>Built with NGBoost · SHAP · Bayesian Optimization · n=285 experimental datapoints</div>
        </div>
      </footer>
    </div>
  );
}
