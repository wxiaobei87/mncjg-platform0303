import React, { useState } from 'react';
import './App.css';

function App() {
  const [inputs, setInputs] = useState({
    Cd: '',
    Pb: '',
    Nap: '',
    biocharContent: '',
    pH: '',
    temperature: ''
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // 模型参数 - 根据你的验证实验调整
  const MODEL_PARAMS = {
    Cd_coeff: 0.85,
    Pb_coeff: 0.88,
    Nap_coeff: 0.92,
    biochar_effect: 1.2,
    pH_effect: 1.05,
    temp_effect: 0.98
  };

  const predictRemoval = (inputData) => {
    const cd = parseFloat(inputData.Cd) || 0;
    const pb = parseFloat(inputData.Pb) || 0;
    const nap = parseFloat(inputData.Nap) || 0;
    //const biochar = parseFloat(inputData.biocharContent) || 0;
    const pH = parseFloat(inputData.pH) || 7;
    const temp = parseFloat(inputData.temperature) || 25;

    // 基础去除率计算
    const cdRemoval = cd * MODEL_PARAMS.Cd_coeff * MODEL_PARAMS.biochar_effect;
    const pbRemoval = pb * MODEL_PARAMS.Pb_coeff * MODEL_PARAMS.biochar_effect;
    const napRemoval = nap * MODEL_PARAMS.Nap_coeff * MODEL_PARAMS.biochar_effect;

    // 环境因子影响
    const pHFactor = MODEL_PARAMS.pH_effect * (pH > 7 ? 1 : 0.95);
    const tempFactor = MODEL_PARAMS.temp_effect * (temp / 25);

    return {
      cdRemoval: (cdRemoval * pHFactor * tempFactor).toFixed(2),
      pbRemoval: (pbRemoval * pHFactor * tempFactor).toFixed(2),
      napRemoval: (napRemoval * pHFactor * tempFactor).toFixed(2),
      totalEfficiency: ((cdRemoval + pbRemoval + napRemoval) / (cd + pb + nap) * 100).toFixed(2)
    };
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePredict = async () => {
    setLoading(true);
    // 模拟API调用延迟
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const prediction = predictRemoval(inputs);
    setResults(prediction);
    setLoading(false);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>MNCJG 智能修复平台</h1>
        <p>椰壳生物炭/MnOx 复合材料的去除性能预测</p>
      </header>

      <main className="main">
        <section className="input-section">
          <h2>输入污染物浓度</h2>
          <div className="input-group">
            <label>
              Cd(II) 浓度 (mg/L)
              <input
                type="number"
                name="Cd"
                value={inputs.Cd}
                onChange={handleInputChange}
                placeholder="0.0"
                step="0.01"
              />
            </label>
            
            <label>
              Pb(II) 浓度 (mg/L)
              <input
                type="number"
                name="Pb"
                value={inputs.Pb}
                onChange={handleInputChange}
                placeholder="0.0"
                step="0.01"
              />
            </label>
            
            <label>
              萘 浓度 (mg/L)
              <input
                type="number"
                name="Nap"
                value={inputs.Nap}
                onChange={handleInputChange}
                placeholder="0.0"
                step="0.01"
              />
            </label>
          </div>

          <h2>实验条件</h2>
          <div className="input-group">
            <label>
              生物炭含量 (%)
              <input
                type="number"
                name="biocharContent"
                value={inputs.biocharContent}
                onChange={handleInputChange}
                placeholder="50"
                step="1"
              />
            </label>
            
            <label>
              pH 值
              <input
                type="number"
                name="pH"
                value={inputs.pH}
                onChange={handleInputChange}
                placeholder="7"
                step="0.1"
                min="1"
                max="14"
              />
            </label>
            
            <label>
              温度 (°C)
              <input
                type="number"
                name="temperature"
                value={inputs.temperature}
                onChange={handleInputChange}
                placeholder="25"
                step="1"
              />
            </label>
          </div>

          <button 
            className="predict-btn" 
            onClick={handlePredict}
            disabled={loading}
          >
            {loading ? '预测中...' : '预测去除率'}
          </button>
        </section>

        {results && (
          <section className="results-section">
            <h2>预测结果</h2>
            <div className="results-grid">
              <div className="result-card">
                <h3>Cd(II) 去除量</h3>
                <p className="value">{results.cdRemoval} mg/L</p>
              </div>
              <div className="result-card">
                <h3>Pb(II) 去除量</h3>
                <p className="value">{results.pbRemoval} mg/L</p>
              </div>
              <div className="result-card">
                <h3>萘 去除量</h3>
                <p className="value">{results.napRemoval} mg/L</p>
              </div>
              <div className="result-card highlight">
                <h3>总体效率</h3>
                <p className="value">{results.totalEfficiency}%</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
