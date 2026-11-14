import { useState, useEffect } from "react";
import * as recharts from "recharts";

const {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ReferenceLine,
  ScatterChart, Scatter, ZAxis
} = recharts;

const COLORS = {
  bg: "#0a0e1a", surface: "#111827", surfaceHover: "#1a2332", card: "#151d2e",
  border: "#1e293b", borderLight: "#2d3a50", primary: "#06d6a0", primaryDim: "#06d6a040",
  secondary: "#118ab2", accent: "#ef476f", warning: "#ffd166", text: "#e2e8f0",
  textDim: "#94a3b8", textMuted: "#64748b",
};

const POLLUTANT_COLORS = {
  "Cd(II)": "#06d6a0", "Pb(II)": "#118ab2", "As(III)": "#ef476f", "Nap": "#ffd166",
};
const POLLUTANTS = Object.keys(POLLUTANT_COLORS);
const ADSORBENTS = ["MNCJG", "MNC", "NC", "NCJG", "MWM"];
const MODEL_API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

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
  const [volume, setVolume] = useState(50);
  const [mass, setMass] = useState(0.1);
  const [predictions, setPredictions] = useState(null);
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const metric = { r2: 0.9951, rmse: 2.5242, mae: 1.9038, n: 288 };
  const pollColor = POLLUTANT_COLORS[pol] || COLORS.primary;

  useEffect(() => {
    let cancelled = false;
    const times = Array.from({ length: 31 }, (_, i) => i);
    const phs = Array.from({ length: 13 }, (_, i) => +(2 + i * 0.5).toFixed(1));
    const requests = [
      { adsorbent: ads, pollutant: pol, pH, concentration: conc, volume, mass, time },
      ...times.map(t => ({ adsorbent: ads, pollutant: pol, pH, concentration: conc, volume, mass, time: t })),
      ...phs.flatMap(ph => POLLUTANTS.map(pl => ({ adsorbent: ads, pollutant: pl, pH: ph, concentration: conc, volume, mass, time }))),
    ];
    setLoading(true);
    setApiError("");
    fetch(`${MODEL_API_BASE_URL}/api/predict/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requests),
    }).then(r => { if (!r.ok) throw new Error(`Model API returned ${r.status}`); return r.json(); })
      .then(rows => { if (!cancelled) setPredictions({ rows, times, phs }); })
      .catch(e => { if (!cancelled) setApiError("NGBoost API is unavailable. Check the configured model API URL and service status. " + e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ads, pol, pH, conc, time, volume, mass]);

  const rows = predictions?.rows || [];
  const pred = rows[0] || { mean: 0, std: 0, lower95: 0, upper95: 0 };
  const kineticData = predictions ? predictions.times.map((t, i) => ({ time: t, removal: rows[i + 1].mean, upper: rows[i + 1].upper95, lower: rows[i + 1].lower95 })) : [];
  const phStart = 1 + predictions?.times.length;
  const phData = predictions ? predictions.phs.map((ph, i) => {
    const row = { pH: ph };
    POLLUTANTS.forEach((pl, j) => { row[pl] = rows[phStart + i * POLLUTANTS.length + j].mean; });
    return row;
  }) : [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, minHeight: 600 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, paddingBottom: 12, borderBottom: `1px solid ${COLORS.border}` }}>⚙️ Input Parameters</div>
        <Select label="Adsorbent" value={ads} onChange={setAds} options={["MNCJG", "MNC", "NC", "NCJG", "MWM"]} />
        <Select label="Pollutant" value={pol} onChange={setPol} options={["Cd(II)", "Pb(II)", "As(III)", "Nap"]} />
        <Slider label="pH" value={pH} onChange={setPH} min={2} max={8} step={0.5} />
        <Slider label="Concentration" value={conc} onChange={setConc} min={1} max={pol === "Nap" ? 100 : 40} step={1} unit=" mg/L" />
        <Slider label="Contact Time" value={time} onChange={setTime} min={0} max={30} step={1} unit=" min" />
        <Slider label="Solution Volume" value={volume} onChange={setVolume} min={10} max={100} step={10} unit=" mL" />
        <Slider label="Adsorbent Mass" value={mass} onChange={setMass} min={0.02} max={0.5} step={0.01} unit=" g" />
        <div style={{ background: `linear-gradient(135deg, ${pollColor}10, ${COLORS.surface})`, border: `1px solid ${pollColor}30`, borderRadius: 16, padding: 20, textAlign: "center", marginTop: "auto" }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 8 }}>NGBoost Predicted Removal</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: pollColor, lineHeight: 1 }}>{loading ? "…" : pred.mean.toFixed(1)}<span style={{ fontSize: 20 }}>%</span></div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8 }}>Model predictive 95% interval: [{(pred.lower95 ?? 0).toFixed(1)}%, {(pred.upper95 ?? 0).toFixed(1)}%]</div>
          {apiError && <div style={{ color: COLORS.accent, fontSize: 11, marginTop: 8 }}>{apiError}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <MetricCard label="R² Score" value={metric.r2.toFixed(4)} color={COLORS.primary} subtitle="NGBoost held-out test set" icon="📊" />
          <MetricCard label="RMSE" value={metric.rmse.toFixed(4)} color={COLORS.secondary} subtitle="Removal percentage points" icon="📉" />
          <MetricCard label="MAE" value={metric.mae.toFixed(4)} color={COLORS.warning} subtitle="Removal percentage points" icon="🎯" />
          <MetricCard label="Samples" value={metric.n} color={COLORS.accent} subtitle="Model-development dataset" icon="🧪" />
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted }}>Predictions and intervals are returned by the retrained NGBoost model; performance metrics are from the 58-row held-out test set.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16 }}>⏱ Adsorption Kinetics — {pol}</div>
            <ResponsiveContainer width="100%" height={220}><AreaChart data={kineticData}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} /><XAxis dataKey="time" stroke={COLORS.textMuted} fontSize={11} /><YAxis domain={[0, 105]} stroke={COLORS.textMuted} fontSize={11} /><Tooltip /><Area type="monotone" dataKey="upper" stroke="none" fill={`${pollColor}15`} /><Area type="monotone" dataKey="lower" stroke="none" fill={COLORS.card} /><Line type="monotone" dataKey="removal" stroke={pollColor} strokeWidth={2.5} dot={false} /><ReferenceLine x={time} stroke={COLORS.accent} strokeDasharray="4 4" /></AreaChart></ResponsiveContainer>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16 }}>🧪 NGBoost pH Response — All Pollutants</div>
            <ResponsiveContainer width="100%" height={220}><LineChart data={phData}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} /><XAxis dataKey="pH" stroke={COLORS.textMuted} fontSize={11} /><YAxis domain={[0, 105]} stroke={COLORS.textMuted} fontSize={11} /><Tooltip />{Object.entries(POLLUTANT_COLORS).map(([name, color]) => <Line key={name} type="monotone" dataKey={name} stroke={color} strokeWidth={name === pol ? 3 : 1.5} dot={false} strokeOpacity={name === pol ? 1 : 0.5} />)}<ReferenceLine x={pH} stroke={COLORS.textMuted} strokeDasharray="4 4" /></LineChart></ResponsiveContainer>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20, gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Model details</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8 }}>NGBoost fitted on 288 observations; test metrics use the common 58-observation held-out set. This working build does not display SHAP values until the explainer is connected to the deployed pipeline.</div>
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
  const [volume, setVolume] = useState(50);
  const [mass, setMass] = useState(0.1);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const polColor = POLLUTANT_COLORS[pol] || COLORS.primary;

  const runOptimization = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const samples = Array.from({ length: 80 }, (_, i) => ({
        iteration: i + 1,
        pH: +(phMin + Math.random() * (phMax - phMin)).toFixed(2),
        time: +(timeMin + Math.random() * (timeMax - timeMin)).toFixed(1),
        concentration: +(concMin + Math.random() * (concMax - concMin)).toFixed(1),
      }));
      const requests = samples.map(s => ({ adsorbent: ads, pollutant: pol, pH: s.pH, concentration: s.concentration, volume, mass, time: s.time }));
      const response = await fetch(`${MODEL_API_BASE_URL}/api/predict/batch`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requests),
      });
      if (!response.ok) throw new Error(`Model API returned ${response.status}`);
      const predictions = await response.json();
      const history = samples.map((s, i) => ({ ...s, ...predictions[i] }));
      const acceptable = history.filter(x => x.mean >= target);
      const best = acceptable.length
        ? [...acceptable].sort((a, b) => a.time - b.time || a.concentration - b.concentration || b.mean - a.mean)[0]
        : [...history].sort((a, b) => (b.lower95 ?? b.mean) - (a.lower95 ?? a.mean))[0];
      const phs = Array.from({ length: 21 }, (_, i) => +(phMin + i * (phMax - phMin) / 20).toFixed(2));
      const sensResponse = await fetch(`${MODEL_API_BASE_URL}/api/predict/batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(phs.map(pH => ({ adsorbent: ads, pollutant: pol, pH, concentration: best.concentration, volume, mass, time: best.time }))),
      });
      if (!sensResponse.ok) throw new Error(`Sensitivity API returned ${sensResponse.status}`);
      const sensPredictions = await sensResponse.json();
      setResult({
        best,
        targetMet: acceptable.length > 0,
        history: history.map((x, i) => ({ ...x, bestSoFar: Math.max(...history.slice(0, i + 1).map(y => y.mean)) })),
        sensitivity: phs.map((pH, i) => ({ pH, mean: sensPredictions[i].mean, upper: sensPredictions[i].upper95, lower: sensPredictions[i].lower95 })),
      });
    } catch (e) {
      setError(`NGBoost API is unavailable or returned an error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 28, color: COLORS.textMuted, lineHeight: 1.7 }}>
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, minHeight: 600 }}>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 15 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>🎯 Optimization Objectives</div>
        <Select label="Target Pollutant" value={pol} onChange={v => { setPol(v); setConcMax(v === "Nap" ? 100 : 20); }} options={["Cd(II)", "Pb(II)", "As(III)", "Nap"]} />
        <Select label="Adsorbent" value={ads} onChange={setAds} options={["MNCJG", "MNC", "NC", "NCJG", "MWM"]} />
        <Slider label="Target Removal" value={target} onChange={setTarget} min={50} max={99} step={1} unit="%" />
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Search Space Bounds</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Slider label="pH min" value={phMin} onChange={setPhMin} min={2} max={7} step={0.5} />
          <Slider label="pH max" value={phMax} onChange={setPhMax} min={3} max={8} step={0.5} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Slider label="Time min" value={timeMin} onChange={setTimeMin} min={0} max={25} step={1} unit=" min" />
          <Slider label="Time max" value={timeMax} onChange={setTimeMax} min={5} max={30} step={1} unit=" min" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Slider label="Conc min" value={concMin} onChange={setConcMin} min={1} max={30} step={1} unit=" mg/L" />
          <Slider label="Conc max" value={concMax} onChange={setConcMax} min={5} max={pol === "Nap" ? 100 : 40} step={1} unit=" mg/L" />
        </div>
        <Slider label="Solution Volume" value={volume} onChange={setVolume} min={10} max={100} step={10} unit=" mL" />
        <Slider label="Adsorbent Mass" value={mass} onChange={setMass} min={0.02} max={0.5} step={0.01} unit=" g" />
        <button onClick={runOptimization} disabled={running || phMin >= phMax || timeMin >= timeMax || concMin >= concMax} style={{ padding: "13px 16px", borderRadius: 12, border: "none", cursor: running ? "wait" : "pointer", background: running ? COLORS.border : `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, color: "#fff", fontSize: 13, fontWeight: 700, marginTop: "auto" }}>
          {running ? "⏳ Evaluating with NGBoost…" : "🚀 Run model-based search"}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: `${COLORS.secondary}10`, border: `1px solid ${COLORS.secondary}30`, borderRadius: 12, padding: 14, fontSize: 12, color: COLORS.textDim }}>
          Eighty candidate conditions are scored by the fitted NGBoost API. The search samples pH, contact time, and concentration; solution volume and adsorbent mass are held at the selected values. This is model-based random search, not Bayesian optimization or prospective material design.
        </div>
        {error && <div style={{ color: COLORS.accent, background: `${COLORS.accent}12`, borderRadius: 10, padding: 12, fontSize: 12 }}>{error}</div>}
        {result ? <>
          <div style={{ background: COLORS.surface, border: `1px solid ${polColor}40`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>{result.targetMet ? "✅ Candidate conditions meeting the target" : "⚠️ Target not reached in sampled conditions; best lower-confidence candidate"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              <MetricCard label="pH" value={result.best.pH} color={COLORS.primary} />
              <MetricCard label="Time" value={result.best.time} unit="min" color={COLORS.secondary} />
              <MetricCard label="Concentration" value={result.best.concentration} unit="mg/L" color={COLORS.warning} />
              <MetricCard label="Predicted" value={result.best.mean.toFixed(1)} unit="%" color={polColor} />
              <MetricCard label="95% interval" value={`${result.best.lower95.toFixed(1)}–${result.best.upper95.toFixed(1)}`} unit="%" color={COLORS.textMuted} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>📈 Candidate search progression</div>
              <ResponsiveContainer width="100%" height={240}><LineChart data={result.history}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} /><XAxis dataKey="iteration" stroke={COLORS.textMuted} fontSize={10} /><YAxis domain={[0, 105]} stroke={COLORS.textMuted} fontSize={10} /><Tooltip /><ReferenceLine y={target} stroke={COLORS.warning} strokeDasharray="5 5" /><Line type="monotone" dataKey="bestSoFar" stroke={COLORS.primary} strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="mean" stroke={polColor} strokeWidth={1} dot={false} strokeOpacity={0.35} /></LineChart></ResponsiveContainer>
            </div>
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>🗺 pH–Time candidate map (bubble size = predicted removal)</div>
              <ResponsiveContainer width="100%" height={240}><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} /><XAxis dataKey="pH" type="number" domain={[phMin, phMax]} name="pH" stroke={COLORS.textMuted} fontSize={10} /><YAxis dataKey="time" type="number" domain={[timeMin, timeMax]} name="Time (min)" stroke={COLORS.textMuted} fontSize={10} /><ZAxis dataKey="mean" range={[30, 180]} name="Predicted removal" /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter data={result.history} fill={polColor} fillOpacity={0.65} /></ScatterChart></ResponsiveContainer>
            </div>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>🌊 NGBoost pH response at the selected time and concentration</div>
            <ResponsiveContainer width="100%" height={220}><AreaChart data={result.sensitivity}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} /><XAxis dataKey="pH" stroke={COLORS.textMuted} fontSize={10} /><YAxis domain={[0, 105]} stroke={COLORS.textMuted} fontSize={10} /><Tooltip /><ReferenceLine y={target} stroke={COLORS.warning} strokeDasharray="5 5" /><Area type="monotone" dataKey="upper" stroke="none" fill={`${polColor}18`} /><Area type="monotone" dataKey="lower" stroke="none" fill={COLORS.card} /><Line type="monotone" dataKey="mean" stroke={polColor} strokeWidth={2.5} dot={false} /></AreaChart></ResponsiveContainer>
          </div>
        </> : <div style={{ flex: 1, minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 36, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 14, opacity: 0.45 }}>🧪</div><div style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDim }}>Configure and run the model-based search</div><div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8, maxWidth: 460 }}>The platform will evaluate candidate operating conditions using the deployed NGBoost model and return its prediction interval.</div>
        </div>}
      </div>
    </div>
  </div>;
}

function ModelBenchmarkPanel() {
  const models = [
    { name: "NGBoost", r2: 0.9950997145, rmse: 2.5241557038, mae: 1.9038054541, category: "Probabilistic boosting", color: COLORS.primary },
    { name: "Random Forest", r2: 0.9927969989, rmse: 3.0602872383, mae: 2.2544665919, category: "Bagging", color: COLORS.secondary },
    { name: "CatBoost", r2: 0.9911935375, rmse: 3.3838117758, mae: 2.3035697668, category: "Boosting", color: "#8b5cf6" },
    { name: "XGBoost", r2: 0.9902544372, rmse: 3.5596632424, mae: 2.6598125963, category: "Boosting", color: "#818cf8" },
    { name: "ExtraTrees", r2: 0.9820201998, rmse: 4.8350156215, mae: 3.6087907345, category: "Bagging", color: "#38bdf8" },
    { name: "Decision Tree", r2: 0.9745567438, rmse: 5.7516413409, mae: 3.7547240374, category: "Tree-based", color: COLORS.warning },
    { name: "AdaBoost", r2: 0.9424944448, rmse: 8.6468983143, mae: 6.8100703639, category: "Boosting", color: "#a78bfa" },
    { name: "KNN", r2: 0.4907808795, rmse: 25.7310674158, mae: 17.8414446857, category: "Instance-based", color: "#f97316" },
    { name: "ElasticNet", r2: 0.3499474076, rmse: 29.0723205644, mae: 24.2660157600, category: "Linear", color: COLORS.accent },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20, color: COLORS.textMuted, fontSize: 12 }}>
        Metrics are from the common 58-observation held-out test set. The modeling dataset contained 288 observations (230 training, 58 test); each model used the same train/test partition and target scale.
      </div>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20, overflow: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 16 }}>📋 Common Test-Set Benchmark</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>{["Rank", "Model", "Category", "R²", "RMSE (pp)", "MAE (pp)"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: COLORS.textMuted, fontSize: 11 }}>{h}</th>)}</tr></thead>
          <tbody>{models.map((m, i) => <tr key={m.name} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <td style={{ padding: "11px 14px", color: COLORS.textDim }}>#{i + 1}</td><td style={{ padding: "11px 14px", color: COLORS.text, fontWeight: 600 }}><GlowDot color={m.color} /><span style={{ marginLeft: 8 }}>{m.name}</span>{i === 0 && <span style={{ marginLeft: 8, fontSize: 10, color: COLORS.primary }}>BEST</span>}</td>
            <td style={{ padding: "11px 14px", color: COLORS.textDim }}>{m.category}</td><td style={{ padding: "11px 14px", color: COLORS.text }}>{m.r2.toFixed(4)}</td><td style={{ padding: "11px 14px", color: COLORS.textDim }}>{m.rmse.toFixed(4)}</td><td style={{ padding: "11px 14px", color: COLORS.textDim }}>{m.mae.toFixed(4)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function ValidationPanel() {
  const groups = [
    { id: "VS1", pollutant: "Cd(II)", pH: 6.2, concentration: 18.5, measured: 95.1, sd: 0.8 },
    { id: "VS2-a", pollutant: "Pb(II)", pH: 5.8, concentration: 22.0, measured: 91.3, sd: 1.1 },
    { id: "VS2-b", pollutant: "Nap", pH: 5.8, concentration: 35.0, measured: 87.2, sd: 1.5 },
  ];
  const [predictions, setPredictions] = useState(null);
  const [apiError, setApiError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const requests = groups.map(g => ({
      adsorbent: "MNCJG", pollutant: g.pollutant, pH: g.pH,
      concentration: g.concentration, time: 30, volume: 50, mass: 0.1,
    }));
    fetch(`${MODEL_API_BASE_URL}/api/predict/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requests),
    }).then(r => { if (!r.ok) throw new Error(`Model API returned ${r.status}`); return r.json(); })
      .then(rows => { if (!cancelled) setPredictions(rows); })
      .catch(e => { if (!cancelled) setApiError(e.message); });
    return () => { cancelled = true; };
  }, []);
  return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    <div style={{ background: `${COLORS.secondary}12`, border: `1px solid ${COLORS.secondary}40`, borderRadius: 16, padding: 20, color: COLORS.textDim, fontSize: 12, lineHeight: 1.7 }}>
      <div style={{ color: COLORS.secondary, fontWeight: 700, marginBottom: 6 }}>Three independent wet-lab validation cases</div>
      Conditions and reported measured outcomes below are transcribed from the previous platform record. NGBoost predictions are requested from the deployed model using MNCJG, 30 min, 50 mL, and 0.1 g; absolute errors are calculated against the reported experimental means. Please verify the transcribed measurements against the original laboratory records before citing them.
    </div>
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>{["Validation group", "Pollutant and conditions", "Measured outcome (%)", "NGBoost prediction (%)", "Absolute error (pp)"].map(h => <th key={h} style={{ padding: "11px 12px", textAlign: "left", color: COLORS.textMuted, fontSize: 10 }}>{h}</th>)}</tr></thead>
        <tbody>{groups.map((g, i) => {
          const pred = predictions?.[i];
          return <tr key={g.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <td style={{ padding: "13px 12px", color: COLORS.text, fontWeight: 600 }}>{g.id}</td>
            <td style={{ padding: "13px 12px", color: COLORS.textDim }}>{g.pollutant}; pH {g.pH}; C₀ {g.concentration} mg/L; 30 min</td>
            <td style={{ padding: "13px 12px", color: COLORS.secondary }}>{g.measured.toFixed(1)} ± {g.sd.toFixed(1)}</td>
            <td style={{ padding: "13px 12px", color: pred ? COLORS.primary : COLORS.textMuted }}>{pred ? `${pred.mean.toFixed(1)} [${pred.lower95.toFixed(1)}–${pred.upper95.toFixed(1)}]` : apiError ? `Unavailable (${apiError})` : "Loading from NGBoost API…"}</td>
            <td style={{ padding: "13px 12px", color: pred ? COLORS.textDim : COLORS.textMuted }}>{pred ? Math.abs(pred.mean - g.measured).toFixed(1) : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
      <div style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 12 }}>Absolute error is reported in percentage points (pp); brackets show the model-reported 95% predictive interval.</div>
    </div>
  </div>;
}

function MaterialComparisonPanel() {
  const [pH, setPH] = useState(6);
  const [metalConc, setMetalConc] = useState(5);
  const [napConc, setNapConc] = useState(50);
  const [time, setTime] = useState(30);
  const [volume, setVolume] = useState(50);
  const [mass, setMass] = useState(0.1);
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [cycleData, setCycleData] = useState([]);
  const [cycleError, setCycleError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const requests = ADSORBENTS.flatMap(adsorbent => POLLUTANTS.map(pollutant => ({
      adsorbent, pollutant, pH, concentration: pollutant === "Nap" ? napConc : metalConc, volume, mass, time,
    })));
    setLoading(true);
    setApiError("");
    fetch(`${MODEL_API_BASE_URL}/api/predict/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requests),
    }).then(r => { if (!r.ok) throw new Error(`Model API returned ${r.status}`); return r.json(); })
      .then(rows => { if (!cancelled) setPredictions(rows); })
      .catch(e => { if (!cancelled) setApiError(`NGBoost API is unavailable: ${e.message}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pH, metalConc, napConc, time, volume, mass]);

  const loadCycleFile = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCycleError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = String(reader.result).replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean);
        const headers = lines[0].split(/[\t,;]/).map(x => x.trim());
        const required = ["cycle", "Cd(II)", "Pb(II)", "As(III)", "Nap"];
        const indexes = required.map(name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase()));
        if (indexes.some(i => i < 0)) throw new Error("CSV headers must be: cycle,Cd(II),Pb(II),As(III),Nap");
        const rows = lines.slice(1).map(line => {
          const cells = line.split(/[\t,;]/).map(x => x.trim());
          const row = Object.fromEntries(required.map((name, i) => [name, Number(cells[indexes[i]])]));
          if (Object.values(row).some(v => !Number.isFinite(v))) throw new Error("Each row must contain numeric cycle and removal values.");
          return row;
        });
        if (!rows.length) throw new Error("The file contains no data rows.");
        setCycleData(rows);
      } catch (e) {
        setCycleData([]);
        setCycleError(e.message);
      }
    };
    reader.onerror = () => setCycleError("Could not read the selected file.");
    reader.readAsText(file);
  };

  const cellStyle = (value) => {
    const opacity = Math.max(0.14, Math.min(0.72, value / 140));
    const hue = value >= 80 ? "6,214,160" : value >= 50 ? "17,138,178" : "239,71,111";
    return { background: `rgba(${hue},${opacity})`, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: "14px 6px", textAlign: "center" };
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    <div style={{ background: `${COLORS.secondary}10`, border: `1px solid ${COLORS.secondary}30`, borderRadius: 12, padding: 14, color: COLORS.textDim, fontSize: 12, lineHeight: 1.6 }}>
      Material comparison values below are predictions from the fitted NGBoost model at the selected operating conditions; they are not experimental measurements. The cycling chart only displays values from a user-supplied experimental CSV.
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18 }}>
      <Slider label="pH" value={pH} onChange={setPH} min={2} max={8} step={0.5} />
      <Slider label="Metal concentration" value={metalConc} onChange={setMetalConc} min={1} max={40} step={1} unit=" mg/L" />
      <Slider label="Naphthalene concentration" value={napConc} onChange={setNapConc} min={1} max={100} step={1} unit=" mg/L" />
      <Slider label="Contact time" value={time} onChange={setTime} min={0} max={30} step={1} unit=" min" />
      <Slider label="Solution volume" value={volume} onChange={setVolume} min={10} max={100} step={10} unit=" mL" />
      <Slider label="Adsorbent mass" value={mass} onChange={setMass} min={0.02} max={0.5} step={0.01} unit=" g" />
    </div>
    {apiError && <div style={{ color: COLORS.accent, background: `${COLORS.accent}12`, borderRadius: 10, padding: 12, fontSize: 12 }}>{apiError}</div>}
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 22, opacity: loading ? 0.65 : 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>🔥 NGBoost-predicted removal comparison</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 16 }}>pH {pH}; {time} min; metals C₀ {metalConc} mg/L; naphthalene C₀ {napConc} mg/L</div>
      <div style={{ display: "grid", gridTemplateColumns: `110px repeat(${POLLUTANTS.length}, minmax(90px, 1fr))`, gap: 5, overflowX: "auto" }}>
        <div />{POLLUTANTS.map(p => <div key={p} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: POLLUTANT_COLORS[p], padding: 8 }}>{p}</div>)}
        {ADSORBENTS.flatMap((adsorbent, i) => [
          <div key={`label-${adsorbent}`} style={{ display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: COLORS.text }}>{adsorbent}</div>,
          ...POLLUTANTS.map((pollutant, j) => {
            const row = predictions?.[i * POLLUTANTS.length + j];
            return <div key={`${adsorbent}-${pollutant}`} style={cellStyle(row?.mean || 0)} title={row ? `95% interval ${row.lower95.toFixed(2)}–${row.upper95.toFixed(2)}%` : "Waiting for NGBoost API"}>
              <div style={{ fontSize: 19, fontWeight: 700, color: COLORS.text }}>{row ? `${row.mean.toFixed(1)}%` : "—"}</div>
              <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 3 }}>{row ? `${row.lower95.toFixed(1)}–${row.upper95.toFixed(1)}%` : "95% interval"}</div>
            </div>;
          }),
        ])}
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>♻️ MNCJG cycling stability (experimental data)</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>Upload a CSV with columns: cycle,Cd(II),Pb(II),As(III),Nap</div>
        <input type="file" accept=".csv,.txt" onChange={loadCycleFile} style={{ color: COLORS.textDim, fontSize: 11, marginBottom: 12, maxWidth: "100%" }} />
        {cycleError && <div style={{ color: COLORS.accent, fontSize: 11, marginBottom: 8 }}>{cycleError}</div>}
        {cycleData.length ? <ResponsiveContainer width="100%" height={250}><LineChart data={cycleData}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} /><XAxis dataKey="cycle" stroke={COLORS.textMuted} fontSize={10} /><YAxis domain={[0, 105]} stroke={COLORS.textMuted} fontSize={10} /><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />{POLLUTANTS.map(name => <Line key={name} type="monotone" dataKey={name} stroke={POLLUTANT_COLORS[name]} strokeWidth={2} dot={{ r: 3 }} />)}</LineChart></ResponsiveContainer>
          : <div style={{ minHeight: 185, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: COLORS.textMuted, fontSize: 12, padding: 20 }}>No cycle measurements are loaded. Upload your regeneration/reuse experiment results to plot them here; no synthetic cycle values are inserted.</div>}
      </div>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20, maxHeight: 380, overflow: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 14 }}>📋 Model prediction details</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead><tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>{["Material", "Pollutant", "Predicted", "95% interval"].map(h => <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: COLORS.textMuted }}>{h}</th>)}</tr></thead>
          <tbody>{ADSORBENTS.flatMap((adsorbent, i) => POLLUTANTS.map((pollutant, j) => {
            const row = predictions?.[i * POLLUTANTS.length + j];
            return <tr key={`${adsorbent}-${pollutant}`} style={{ borderBottom: `1px solid ${COLORS.border}` }}><td style={{ padding: 8, color: COLORS.text }}>{adsorbent}</td><td style={{ padding: 8, color: POLLUTANT_COLORS[pollutant] }}>{pollutant}</td><td style={{ padding: 8, color: COLORS.text }}>{row ? `${row.mean.toFixed(2)}%` : "—"}</td><td style={{ padding: 8, color: COLORS.textDim }}>{row ? `${row.lower95.toFixed(2)}–${row.upper95.toFixed(2)}%` : "—"}</td></tr>;
          }))}</tbody>
        </table>
      </div>
    </div>
  </div>;
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
              <p style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>Machine-learning-assisted performance prediction for heavy metal–naphthalene co-contamination</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: `${COLORS.primary}12`, borderRadius: 20, border: `1px solid ${COLORS.primary}25` }}>
              <GlowDot color={COLORS.primary} size={6} />
              <span style={{ fontSize: 11, color: COLORS.primary, fontWeight: 600 }}>NGBoost v1.0</span>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>R² = 0.9951 · RMSE = 2.5242</div>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px" }}>
        <TabBar tabs={tabs} active={activeTab} onSelect={setActiveTab} />
        <div style={{ marginTop: 24 }}>
          {activeTab === "predict" && <><SectionTitle subtitle="Live NGBoost prediction and predictive intervals from the retrained 288-observation model.">Forward Prediction Engine</SectionTitle><PredictionPanel /></>}
          {activeTab === "optimize" && <><SectionTitle subtitle="Explore operating conditions with predictions from the retrained NGBoost model.">Inverse Design Optimization</SectionTitle><OptimizationPanel /></>}
          {activeTab === "benchmark" && <><SectionTitle subtitle="Nine models compared on the same 58-observation held-out test set.">Multi-Algorithm Benchmark</SectionTitle><ModelBenchmarkPanel /></>}
          {activeTab === "validate" && <><SectionTitle subtitle="Protocol and source-data status for the three independent wet-lab validation groups.">Independent Experimental Validation</SectionTitle><ValidationPanel /></>}
          {activeTab === "material" && <><SectionTitle subtitle="Compare NGBoost-predicted removal across materials and pollutants, and visualize your experimental reuse-cycle data.">Material Performance Analysis</SectionTitle><MaterialComparisonPanel /></>}
        </div>
      </main>
      <footer style={{ padding: "20px 32px", borderTop: `1px solid ${COLORS.border}`, marginTop: 40 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>Wang X.Y. et al. · Henan University · Engineering Research Center for Nanomaterials</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>Live NGBoost inference API · 288 modeling observations · test metrics on 58 held-out cases</div>
        </div>
      </footer>
    </div>
  );
}
