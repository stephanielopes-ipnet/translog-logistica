/** Marca TransLog: etiqueta de remessa + rota internacional com ponto âmbar. */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" aria-hidden="true" className="shrink-0">
      <rect width="38" height="38" rx="6" fill="#0F4C81" />
      <path
        d="M9 12h13l7 7-7 7H9V12z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="19" r="2" fill="#ffffff" />
      <path
        d="M16 19h6"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="2 2"
      />
      <circle cx="29" cy="19" r="3" fill="#F59E0B" />
    </svg>
  );
}
