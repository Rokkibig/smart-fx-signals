export const Footer = () => {
  return (
    <footer className="dotted-border-t pt-6 mt-12 text-xs text-muted-foreground">
      <div className="space-y-2">
        <p>
          <strong>Попередження:</strong> Ринки ризикові. Перевіряйте сигнали
          перед торгівлею. Ризик на угоду ≤ 1–1.5%.
        </p>
        <p>
          Джерело котирувань: Forex API (live). Новини high-impact: врахована пауза
          ±30 хв.
        </p>
        <p className="pt-2">
          Timezone: Europe/Berlin (CET) • API: /signals, /matrix, /ascii
        </p>
      </div>
    </footer>
  );
};
