import { MARTINPEL_LOGO_DATA_URL } from '../lib/martinpelLogo';

export default function MartinpelBrand({
  compact = false,
  subtitle = 'Uniformes profissionais',
  className = '',
}) {
  return (
    <div className={`martinpel-brand martinpel-system-brand ${compact ? 'is-compact' : ''} ${className}`.trim()}>
      <div className="martinpel-brand-emblem">
        <div className="martinpel-brand-logo">
          <img src={MARTINPEL_LOGO_DATA_URL} alt="Koleni Uniformes" />
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
