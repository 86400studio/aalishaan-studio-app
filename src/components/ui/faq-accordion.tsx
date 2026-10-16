/**
 * The one shared accordion style (docs/DESIGN.md §3 "FAQ accordion"; revision-r11.css:25–30): a native
 * `<details>` card — open without JavaScript, the first item open where the page says so. The Help page adds
 * its `utility-faq` class and topic wrapper; Home uses the card as it is.
 */
export function FaqItem({
  question,
  answer,
  open = false,
  className = "",
}: {
  question: string;
  answer: string;
  open?: boolean;
  className?: string;
}) {
  return (
    <details className={`r11-faq ${className}`.trim()} open={open || undefined}>
      <summary>{question}</summary>
      <p>{answer}</p>
    </details>
  );
}
