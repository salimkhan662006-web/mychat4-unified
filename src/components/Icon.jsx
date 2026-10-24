// One place that sets icon size and line weight for the whole app.
export default function Icon({ icon: Glyph, size = 18, stroke = 1.5, className = "", ...rest }) {
  return (
    <Glyph
      size={size}
      strokeWidth={stroke}
      className={`ui-icon ${className}`.trim()}
      aria-hidden="true"
      {...rest}
    />
  );
}