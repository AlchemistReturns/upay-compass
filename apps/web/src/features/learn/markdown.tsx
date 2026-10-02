import { Fragment } from "react";

/**
 * A tiny renderer for the Markdown subset the learn modules use: "## heading", paragraphs,
 * "- " bullet lists and **bold**. The content is ours and trusted; nothing is injected as HTML.
 */

function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
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
    <div className="space-y-3 text-[15px] leading-relaxed">
      {parseBlocks(source).map((b, i) =>
        b.kind === "h" ? (
          <h2 key={i} className="pt-2 text-base font-semibold">
            {b.text}
          </h2>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1.5 ps-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b.text)}</p>
        ),
      )}
    </div>
  );
}
