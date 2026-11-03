import { useEffect, useMemo, useState } from 'react';
import {
  colorToCss,
  prepareBackgroundRemoval,
  processBackgroundRemoval,
  samplePreparedColor,
} from '../lib/localBackgroundRemoval';
import { AI_REFINEMENT_PRESETS, refineAiCutout } from '../lib/refineAiCutout';
import { analyzePreparedBackground } from '../lib/backgroundRemovalStrategy';
import { removeBackgroundWithRemoveBg } from '../lib/removeBgApi';
import MaskRefinementEditor from './MaskRefinementEditor';
import '../background-removal-ai.css';

const DEFAULT_AI_PRESET = AI_REFINEMENT_PRESETS.maximum;

function progressPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric <= 1 ? numeric * 100 : numeric)));
}

export default function BackgroundRemovalDialog({
  open,
  source,
  cacheKey,
  fileName,
  onCancel,
  onApply,
}) {
  const [prepared, setPrepared] = useState(null);
  const [backgroundColor, setBackgroundColor] = useState(null);
  const [tolerance, setTolerance] = useState(42);
  const [feather, setFeather] = useState(12);
  const [removeInternalIslands, setRemoveInternalIslands] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBlob, setPreviewBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [removalMode, setRemovalMode] = useState('auto');
  const [strategyAnalysis, setStrategyAnalysis] = useState(null);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [maskEditorBlob, setMaskEditorBlob] = useState(null);
  const [removeBgProcessing, setRemoveBgProcessing] = useState(false);
  const [removeBgBlob, setRemoveBgBlob] = useState(null);
  const [removeBgPreviewUrl, setRemoveBgPreviewUrl] = useState('');
  const [removeBgError, setRemoveBgError] = useState('');
  const [removeBgCredits, setRemoveBgCredits] = useState('');
  const [removeBgCached, setRemoveBgCached] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiRefining, setAiRefining] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiMessage, setAiMessage] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiBlob, setAiBlob] = useState(null);
  const [aiRawBlob, setAiRawBlob] = useState(null);
  const [aiInputBlob, setAiInputBlob] = useState(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState('');
  const [aiPreset, setAiPreset] = useState('maximum');
  const [aiDetail, setAiDetail] = useState(DEFAULT_AI_PRESET.detail);
  const [aiCleanup, setAiCleanup] = useState(DEFAULT_AI_PRESET.cleanup);
  const [aiSmoothing, setAiSmoothing] = useState(DEFAULT_AI_PRESET.smoothing);
  const [aiDecontaminate, setAiDecontaminate] = useState(DEFAULT_AI_PRESET.decontaminate);

  const selectedColor = backgroundColor || prepared?.autoColor || null;
  const selectedColorCss = useMemo(() => colorToCss(selectedColor), [selectedColor]);
  const effectiveMode = removalMode === 'auto'
    ? (strategyAnalysis?.recommended || 'solid')
    : removalMode;
  const strategyLabel = effectiveMode === 'solid' ? 'Fundo chapado / logo' : 'IA para arte complexa';

  useEffect(() => {
    if (!open || !source) return undefined;
    let active = true;
    setLoading(true);
    setPrepared(null);
    setBackgroundColor(null);
    setPreviewBlob(null);
    setError('');
    setRemovalMode('auto');
    setStrategyAnalysis(null);
    setMaskEditorOpen(false);
    setMaskEditorBlob(null);
    setRemoveBgProcessing(false);
    setRemoveBgBlob(null);
    setRemoveBgError('');
    setRemoveBgCredits('');
    setRemoveBgCached(false);
    setRemoveBgPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setAiOpen(false);
    setAiProcessing(false);
    setAiRefining(false);
    setAiProgress(0);
    setAiMessage('');
    setAiError('');
    setAiBlob(null);
    setAiRawBlob(null);
    setAiInputBlob(null);
    setAiPreset('maximum');
    setAiDetail(DEFAULT_AI_PRESET.detail);
    setAiCleanup(DEFAULT_AI_PRESET.cleanup);
    setAiSmoothing(DEFAULT_AI_PRESET.smoothing);
    setAiDecontaminate(DEFAULT_AI_PRESET.decontaminate);
    setAiPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });

    prepareBackgroundRemoval(source)
      .then((next) => {
        if (!active) return;
        const analysis = analyzePreparedBackground(next);
        setPrepared(next);
        setStrategyAnalysis(analysis);
        setBackgroundColor(analysis.backgroundColor || next.autoColor);
        setTolerance(analysis.suggestedTolerance || 42);
        setFeather(analysis.suggestedFeather || 12);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, source]);

  useEffect(() => {
    if (!open || !prepared || !selectedColor) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setProcessing(true);
      try {
        const blob = await processBackgroundRemoval(prepared, {
          backgroundColor: selectedColor,
          tolerance,
          feather,
          removeInternalIslands,
        });
        if (!active) return;
        const nextUrl = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
        setError('');
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setProcessing(false);
      }
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, prepared, selectedColor?.r, selectedColor?.g, selectedColor?.b, tolerance, feather, removeInternalIslands]);

  useEffect(() => {
    if (!aiRawBlob || !aiInputBlob) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setAiRefining(true);
      setAiError('');
      try {
        const refinedBlob = await refineAiCutout(aiRawBlob, aiInputBlob, {
          detail: aiDetail,
          cleanup: aiCleanup,
          smoothing: aiSmoothing,
          decontaminate: aiDecontaminate,
        });
        if (!active) return;
        const refinedUrl = URL.createObjectURL(refinedBlob);
        setAiBlob(refinedBlob);
        setAiPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return refinedUrl;
        });
        setAiMessage('Refinamento concluído. Confira letras pequenas, linhas finas e contornos antes de aplicar.');
      } catch (err) {
        if (!active) return;
        setAiError(err?.message || 'Não foi possível refinar o recorte da IA.');
      } finally {
        if (active) setAiRefining(false);
      }
    }, 140);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [aiRawBlob, aiInputBlob, aiDetail, aiCleanup, aiSmoothing, aiDecontaminate]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (aiPreviewUrl) URL.revokeObjectURL(aiPreviewUrl);
  }, [aiPreviewUrl]);

  useEffect(() => () => {
    if (removeBgPreviewUrl) URL.revokeObjectURL(removeBgPreviewUrl);
  }, [removeBgPreviewUrl]);

  if (!open) return null;

  function chooseBackground(event) {
    if (!prepared) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setBackgroundColor(samplePreparedColor(prepared, x, y));
  }

  function selectRemovalMode(mode) {
    setRemovalMode(mode);
    const nextMode = mode === 'auto' ? strategyAnalysis?.recommended : mode;
    if (nextMode === 'solid' && strategyAnalysis?.backgroundColor) {
      setBackgroundColor(strategyAnalysis.backgroundColor);
      setTolerance(strategyAnalysis.suggestedTolerance || 42);
      setFeather(strategyAnalysis.suggestedFeather || 12);
    }
  }

  async function apply() {
    if (!previewBlob || processing) return;
    await onApply?.(previewBlob);
  }

  function openMaskEditor(blob) {
    if (!blob) return;
    setMaskEditorBlob(blob);
    setMaskEditorOpen(true);
  }

  async function applyMaskRefinement(blob) {
    if (!blob) return;
    await onApply?.(blob);
  }

  async function runRemoveBg() {
    if (!source || removeBgProcessing) return;
    setRemoveBgProcessing(true);
    setRemoveBgError('');
    setRemoveBgCredits('');
    setRemoveBgCached(false);
    setRemoveBgBlob(null);
    setRemoveBgPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    try {
      const result = await removeBackgroundWithRemoveBg(source, { cacheKey });
      const nextUrl = URL.createObjectURL(result.blob);
      setRemoveBgBlob(result.blob);
      setRemoveBgPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
      setRemoveBgCredits(result.creditsCharged || '');
      setRemoveBgCached(Boolean(result.cached));
    } catch (err) {
      setRemoveBgError(err?.message || 'Não foi possível remover o fundo com remove.bg.');
    } finally {
      setRemoveBgProcessing(false);
    }
  }

  function handleRemoveBgPreviewError() {
    setRemoveBgBlob(null);
    setRemoveBgCached(false);
    setRemoveBgCredits('');
    setRemoveBgError('O resultado recebido não pôde ser exibido como imagem. Ele não será aplicado à peça. Tente novamente; se persistir, verifique a rota /api/remove-background no Firebase Hosting.');
    setRemoveBgPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  }

  async function applyRemoveBg() {
    if (!removeBgBlob || removeBgProcessing) return;
    await onApply?.(removeBgBlob);
  }

  function applyAiPreset(key) {
    const preset = AI_REFINEMENT_PRESETS[key];
    if (!preset) return;
    setAiPreset(key);
    setAiDetail(preset.detail);
    setAiCleanup(preset.cleanup);
    setAiSmoothing(preset.smoothing);
    setAiDecontaminate(preset.decontaminate);
  }

  function markAiCustom(setter, value) {
    setAiPreset('custom');
    setter(Number(value));
  }

  async function runAiRemoval() {
    if (!source || aiProcessing || aiRefining) return;
    setAiProcessing(true);
    setAiProgress(1);
    setAiMessage('Preparando a logo…');
    setAiError('');
    setAiBlob(null);
    setAiRawBlob(null);
    setAiInputBlob(null);
    setAiPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });

    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error('Não foi possível carregar a logo selecionada.');
      const inputBlob = await response.blob();
      setAiProgress(5);
      setAiMessage('Carregando o modelo de IA em máxima qualidade…');

      const { removeBackground } = await import('@bg0/browser');
      const result = await removeBackground(inputBlob, {
        quality: 'quality',
        onProgress: ({ progress, message }) => {
          setAiProgress(Math.max(5, progressPercent(progress)));
          if (message) setAiMessage(message);
        },
      });

      if (!result?.blob) throw new Error('A IA não retornou uma imagem válida.');
      setAiInputBlob(inputBlob);
      setAiRawBlob(result.blob);
      setAiProgress(100);
      setAiMessage('IA concluída. Aplicando o refinamento de bordas e detalhes…');
    } catch (err) {
      setAiError(err?.message || 'Não foi possível remover o fundo com IA.');
      setAiMessage('');
    } finally {
      setAiProcessing(false);
    }
  }

  async function applyAi() {
    if (!aiBlob || aiProcessing || aiRefining) return;
    await onApply?.(aiBlob);
  }

  if (maskEditorOpen && maskEditorBlob) {
    return (
      <MaskRefinementEditor
        open
        source={source}
        initialBlob={maskEditorBlob}
        onCancel={() => setMaskEditorOpen(false)}
        onApply={applyMaskRefinement}
      />
    );
  }

  if (aiOpen) {
    const aiBusy = aiProcessing || aiRefining;
    return (
      <div className="bg-removal-backdrop bg-ai-backdrop" role="presentation">
        <section className="panel bg-removal-dialog bg-ai-dialog" role="dialog" aria-modal="true" aria-label="Remover logo com IA">
          <div className="bg-removal-head bg-ai-head">
            <div>
              <p className="eyebrow">IA local · máxima qualidade · sem créditos</p>
              <h2>Remover logo com IA</h2>
              <p>A IA faz o recorte e o Koleni refina detalhes finos, contornos e halos diretamente no navegador.</p>
            </div>
            <div className="bg-ai-head-actions">
              <button type="button" className="button button-secondary" onClick={() => setAiOpen(false)} disabled={aiBusy}>← Voltar ao editor manual</button>
              <button type="button" className="bg-removal-close" onClick={onCancel} disabled={aiBusy}>×</button>
            </div>
          </div>

          <div className="bg-ai-file-strip">
            <span>Logo selecionada</span>
            <strong>{fileName || 'Logo selecionada'}</strong>
            <small>O modelo é baixado apenas no primeiro uso. O refinamento acontece localmente e não consome créditos.</small>
          </div>

          <div className="bg-ai-workspace">
            <div className="bg-ai-preview-card">
              <div className="bg-ai-preview-heading"><strong>Original</strong><span>Imagem atualmente posicionada na peça</span></div>
              <div className="bg-ai-preview checkerboard"><img src={source} alt="Logo original" /></div>
            </div>

            <div className="bg-ai-preview-card">
              <div className="bg-ai-preview-heading"><strong>Resultado refinado</strong><span>{aiBlob ? 'PNG transparente pronto para aplicar' : 'Execute a IA para gerar o recorte'}</span></div>
              <div className="bg-ai-preview checkerboard checkerboard-contrast">
                {aiPreviewUrl ? <img src={aiPreviewUrl} alt="Resultado sem fundo refinado" /> : <div className="bg-ai-placeholder">✦</div>}
              </div>
            </div>
          </div>

          <div className="bg-ai-refine-card">
            <div className="bg-ai-refine-head">
              <div><strong>Refinar resultado</strong><span>Ajustes atuam sobre o PNG pronto sem rodar a IA novamente.</span></div>
              {aiPreset === 'custom' && <small>Ajuste personalizado</small>}
            </div>

            <div className="bg-ai-presets" aria-label="Presets de refinamento">
              {Object.entries(AI_REFINEMENT_PRESETS).map(([key, preset]) => (
                <button key={key} type="button" className={aiPreset === key ? 'active' : ''} onClick={() => applyAiPreset(key)} disabled={aiBusy}>
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="bg-ai-refine-grid">
              <label>
                <span>Detalhes finos <strong>{aiDetail}%</strong></span>
                <input type="range" min="45" max="100" step="1" value={aiDetail} onChange={(event) => markAiCustom(setAiDetail, event.target.value)} disabled={aiBusy} />
                <small>Aumente para preservar letras pequenas, fios e ornamentos.</small>
              </label>
              <label>
                <span>Limpeza de borda <strong>{aiCleanup}</strong></span>
                <input type="range" min="0" max="30" step="1" value={aiCleanup} onChange={(event) => markAiCustom(setAiCleanup, event.target.value)} disabled={aiBusy} />
                <small>Remove transparências residuais. Use pouco em logos delicadas.</small>
              </label>
              <label>
                <span>Suavização <strong>{aiSmoothing}%</strong></span>
                <input type="range" min="0" max="40" step="1" value={aiSmoothing} onChange={(event) => markAiCustom(setAiSmoothing, event.target.value)} disabled={aiBusy} />
                <small>Suaviza serrilhado sem desfocar excessivamente o desenho.</small>
              </label>
              <label>
                <span>Remover halo <strong>{aiDecontaminate}%</strong></span>
                <input type="range" min="0" max="100" step="1" value={aiDecontaminate} onChange={(event) => markAiCustom(setAiDecontaminate, event.target.value)} disabled={aiBusy} />
                <small>Corrige bordas esbranquiçadas usando o fundo estimado da imagem original.</small>
              </label>
            </div>
          </div>

          <div className="bg-ai-status-card">
            <div className="bg-ai-status-head">
              <strong>{aiProcessing ? 'Processando com IA…' : aiRefining ? 'Refinando detalhes e bordas…' : aiBlob ? 'Recorte refinado concluído' : 'Pronto para remover o fundo'}</strong>
              <span>{aiProgress}%</span>
            </div>
            <div className="bg-ai-progress"><span style={{ width: `${aiProgress}%` }} /></div>
            <p>{aiMessage || 'Todo o processamento é feito localmente no dispositivo.'}</p>
            {aiError && <div className="inline-error">{aiError}</div>}
          </div>

          <div className="bg-ai-actions">
            <button type="button" className="button button-secondary" onClick={() => setAiOpen(false)} disabled={aiBusy}>Cancelar IA</button>
            <button type="button" className="button button-primary" onClick={runAiRemoval} disabled={aiBusy}>
              {aiProcessing ? 'Processando…' : aiRefining ? 'Refinando…' : aiRawBlob ? 'Refazer com IA' : '✦ Remover fundo com IA'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => openMaskEditor(aiBlob)} disabled={!aiBlob || aiBusy}>
              ✎ Corrigir à mão
            </button>
            <button type="button" className="button button-success" onClick={applyAi} disabled={!aiBlob || aiBusy}>Aplicar resultado</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="bg-removal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !processing) onCancel?.();
    }}>
      <section className="panel bg-removal-dialog" role="dialog" aria-modal="true" aria-label="Remover fundo da logo">
        <div className="bg-removal-head">
          <div>
            <p className="eyebrow">Remoção híbrida · mais confiável</p>
            <h2>Remover fundo da logo</h2>
            <p>O modo automático analisa a imagem e escolhe entre recorte de fundo chapado e IA. Você também pode escolher manualmente.</p>
          </div>
          <button type="button" className="bg-removal-close" onClick={onCancel} disabled={processing}>×</button>
        </div>

        <div className="removebg-official-card">
          <div className="removebg-official-copy">
            <div className="removebg-official-title">
              <span className="removebg-badge">remove.bg oficial</span>
              <strong>Melhor qualidade para testar agora</strong>
            </div>
            <p>Usa a API oficial em <b>preview de até 0,25 MP</b>, PNG transparente e modo gráfico. A chave fica protegida no servidor.</p>
            {removeBgBlob && (
              <small>
                {removeBgCached
                  ? <><strong>Reutilizado do cache</strong> · nenhuma nova chamada à API.</>
                  : removeBgCredits
                    ? <>Última chamada: <strong>{removeBgCredits} crédito(s)</strong> informado(s) pela API.</>
                    : <>Resultado recebido da API oficial.</>}
              </small>
            )}
            {removeBgError && <div className="inline-error">{removeBgError}</div>}
          </div>

          <div className="removebg-official-actions">
            {removeBgPreviewUrl && (
              <div className="removebg-result checkerboard checkerboard-contrast">
                <img src={removeBgPreviewUrl} alt="Resultado do remove.bg" onError={handleRemoveBgPreviewError} />
              </div>
            )}
            <button type="button" className="button button-primary" onClick={runRemoveBg} disabled={removeBgProcessing}>
              {removeBgProcessing ? 'Enviando ao remove.bg…' : removeBgBlob ? 'Refazer com remove.bg' : '✦ Remover com remove.bg'}
            </button>
            {removeBgBlob && (
              <div className="removebg-result-buttons">
                <button type="button" className="button button-secondary" onClick={() => openMaskEditor(removeBgBlob)} disabled={removeBgProcessing}>
                  ✎ Corrigir à mão
                </button>
                <button type="button" className="button button-success" onClick={applyRemoveBg} disabled={removeBgProcessing}>
                  Aplicar resultado
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-hybrid-strategy-card">
          <div className="bg-hybrid-strategy-head">
            <div>
              <strong>Estratégia de remoção</strong>
              <span>
                {removalMode === 'auto'
                  ? `Automático escolheu: ${strategyLabel}`
                  : `Modo selecionado: ${strategyLabel}`}
              </span>
            </div>
            {strategyAnalysis && (
              <small className={effectiveMode === 'solid' ? 'solid' : 'ai'}>
                {effectiveMode === 'solid' ? 'Logo detectada' : 'Arte complexa'} · {strategyAnalysis.confidence}% confiança
              </small>
            )}
          </div>

          <div className="bg-hybrid-mode-tabs" role="group" aria-label="Estratégia de remoção de fundo">
            <button type="button" className={removalMode === 'auto' ? 'active' : ''} onClick={() => selectRemovalMode('auto')}>
              Automático
            </button>
            <button type="button" className={removalMode === 'solid' ? 'active' : ''} onClick={() => selectRemovalMode('solid')}>
              Logo / fundo chapado
            </button>
            <button type="button" className={removalMode === 'ai' ? 'active' : ''} onClick={() => selectRemovalMode('ai')}>
              IA / arte complexa
            </button>
          </div>

          <p className="bg-hybrid-reason">
            {strategyAnalysis?.reason || 'Analisando a melhor estratégia para esta imagem…'}
          </p>
        </div>

        {effectiveMode === 'ai' && (
          <div className="bg-ai-launch-card bg-hybrid-ai-launch">
            <div>
              <strong>Esta imagem combina melhor com IA</strong>
              <span>Use a IA local para fundos irregulares, sombras, degradês, fotos ou várias cores.</span>
            </div>
            <button type="button" className="button button-primary bg-ai-launch-button" onClick={() => setAiOpen(true)}>
              ✦ Abrir remoção com IA
            </button>
          </div>
        )}

        <div className="bg-removal-file">
          <span>Arquivo</span>
          <strong>{fileName || 'Logo selecionada'}</strong>
        </div>

        {error && <div className="inline-error">{error}</div>}
        {loading && <div className="bg-removal-loading">Preparando imagem…</div>}

        {!loading && prepared && effectiveMode === 'solid' && (
          <>
            <div className="bg-hybrid-solid-note">
              <strong>Recorte determinístico para logo</strong>
              <span>Este modo não depende da IA. Ele remove a cor de fundo detectada e preserva a arte, sendo mais estável para fundos lisos.</span>
            </div>
            <div className="bg-removal-preview-grid">
              <div>
                <div className="bg-removal-preview-title">
                  <strong>Original</strong>
                  <span>Clique no fundo para selecionar a cor</span>
                </div>
                <button type="button" className="bg-removal-image checkerboard" onClick={chooseBackground}>
                  <img src={source} alt="Logo original" />
                </button>
              </div>

              <div>
                <div className="bg-removal-preview-title">
                  <strong>Resultado da logo</strong>
                  <span>{processing ? 'Atualizando…' : 'Prévia transparente'}</span>
                </div>
                <div className="bg-removal-image checkerboard checkerboard-contrast">
                  {previewUrl ? <img src={previewUrl} alt="Prévia sem fundo" /> : <span>Gerando prévia…</span>}
                </div>
              </div>
            </div>

            <div className="bg-removal-controls">
              <div className="bg-removal-color-row">
                <span>Cor do fundo</span>
                <span className="bg-removal-color-chip" style={{ background: selectedColorCss }} />
                <code>{selectedColorCss}</code>
                <button type="button" className="mini-link" onClick={() => setBackgroundColor(strategyAnalysis?.backgroundColor || prepared.autoColor)}>Detectar novamente</button>
              </div>

              <label>
                <span>Tolerância <strong>{tolerance}</strong></span>
                <input type="range" min="8" max="110" step="1" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} />
                <small>Aumente se ainda sobrar fundo. Diminua se começar a apagar partes da logo.</small>
              </label>

              <label>
                <span>Suavização da borda <strong>{feather}</strong></span>
                <input type="range" min="0" max="35" step="1" value={feather} onChange={(event) => setFeather(Number(event.target.value))} />
                <small>Suaviza os pixels próximos ao contorno para evitar bordas serrilhadas.</small>
              </label>

              <label className="bg-removal-checkbox">
                <input
                  type="checkbox"
                  checked={removeInternalIslands}
                  onChange={(event) => setRemoveInternalIslands(event.target.checked)}
                />
                <span>
                  <strong>Limpar resíduos internos</strong>
                  <small>Remove pequenos bolsões da cor do fundo presos dentro de letras e símbolos.</small>
                </span>
              </label>
            </div>

            <div className="bg-removal-tip">
              O modo “Logo / fundo chapado” é recomendado para fundos lisos, placas, logos e artes gráficas. Se a prévia apagar parte da marca, diminua a tolerância ou clique diretamente no fundo para selecionar outra cor.
            </div>

            <div className="bg-removal-actions">
              <button type="button" className="button button-secondary" onClick={onCancel} disabled={processing}>Cancelar</button>
              <button type="button" className="button button-secondary" onClick={() => openMaskEditor(previewBlob)} disabled={!previewBlob || processing}>
                ✎ Corrigir à mão
              </button>
              <button type="button" className="button button-primary" onClick={apply} disabled={!previewBlob || processing}>
                {processing ? 'Atualizando…' : 'Aplicar recorte da logo'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
