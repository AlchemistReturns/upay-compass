import { Fragment } from "react";

/**
 * A tiny renderer for the Markdown subset the learn modules use: "## heading", paragraphs,
 * "- " bullet lists and **bold**. The content is ours and trusted; nothing is injected as HTML.
 */

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="text-foreground font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

type Block =
  { kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.trim().split(/\n{2,}/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let list: string[] = [];
    const flush = () => {
      if (list.length) blocks.push({ kind: "ul", items: list });
      list = [];
    };
    let paragraph: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length) blocks.push({ kind: "p", text: paragraph.join(" ") });
      paragraph = [];
    };
    for (const line of lines) {
      if (line.startsWith("## ")) {
        flush();
        flushParagraph();
        blocks.push({ kind: "h", text: line.slice(3) });
      } else if (line.startsWith("- ")) {
        flushParagraph();
        list.push(line.slice(2));
      } else {
        flush();
        paragraph.push(line);
      }
    }
    flush();
    flushParagraph();
  }
  return blocks;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="text-foreground/90 space-y-4 text-base leading-[1.75]">
      {parseBlocks(source).map((b, i) =>
        b.kind === "h" ? (
          <h2
            key={i}
            className="text-foreground pt-3 text-lg leading-snug font-extrabold tracking-tight"
          >
            {b.text}
          </h2>
        ) : b.kind === "ul" ? (
          <ul key={i} className="space-y-2.5">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden className="bg-leaf mt-[0.7em] size-1.5 shrink-0 rounded-full" />
                <span>{inline(item)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b.text)}</p>
        ),
      )}
    </div>
  );
}
