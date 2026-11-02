// Logo Koleni carregado pela mesma origem para funcionar em impressões e relatórios.
export const MARTINPEL_LOGO_DATA_URL = new URL(
  `${import.meta.env.BASE_URL}koleni-logo.svg`,
  window.location.origin,
).href;
