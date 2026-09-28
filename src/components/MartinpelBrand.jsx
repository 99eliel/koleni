export default function MartinpelBrand({
  compact = false,
  subtitle = 'Uniformes profissionais',
  className = '',
}) {
  return (
    <div className={`martinpel-brand martinpel-system-brand ${compact ? 'is-compact' : ''} ${className}`.trim()}>
      <div className="martinpel-brand-emblem" aria-label="Koleni Uniformes">
        <div className="koleni-wordmark" aria-hidden="true">
          <span className="koleni-wordmark-main">koleni</span>
          <span className="koleni-wordmark-sub">uniformes</span>
        </div>
      </div>

      <div className="martinpel-brand-copy">
        <span className="martinpel-brand-company">KOLENI</span>
        <strong>Gestão de Personalização</strong>
        <span className="martinpel-brand-subtitle">{subtitle}</span>
      </div>

      <span className="martinpel-brand-tech-line" aria-hidden="true" />
      <span className="martinpel-brand-stripes" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}
