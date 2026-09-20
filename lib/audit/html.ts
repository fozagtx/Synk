export function firstMatch({ html, expression }: { html: string; expression: RegExp }): string {
  return expression.exec(html)?.[1]?.trim() ?? "";
}

export function pageTitle({ html }: { html: string }): string {
  return firstMatch({ html, expression: /<title[^>]*>([\s\S]*?)<\/title>/i });
}

export function metaContent({ html, name }: { html: string; name: string }): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return firstMatch({
    html,
    expression: new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
  });
}

export function canonicalUrl({ html }: { html: string }): string {
  return firstMatch({ html, expression: /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i });
}

export function headings({ html, level }: { html: string; level: 1 | 2 | 3 }): string[] {
  return Array.from(html.matchAll(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi")))
    .map((match) => (match[1] ?? "").replace(/<[^>]+>/g, "").trim())
    .filter((value) => value.length > 0);
}

export function imageAlts({ html }: { html: string }): { src: string; alt: string }[] {
  return Array.from(html.matchAll(/<img\b([^>]*)>/gi)).map((match) => {
    const attrs = match[1] ?? "";
    return {
      src: firstMatch({ html: attrs, expression: /src=["']([^"']*)["']/i }),
      alt: firstMatch({ html: attrs, expression: /alt=["']([^"']*)["']/i }),
    };
  });
}

export function scriptSources({ html }: { html: string }): string[] {
  return Array.from(html.matchAll(/<script\b[^>]+src=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1] ?? "")
    .filter((value) => value.length > 0);
}

export function modulePreloadSources({ html }: { html: string }): string[] {
  return Array.from(
    html.matchAll(
      /<link\b[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    ),
  )
    .map((match) => match[1] ?? "")
    .filter((value) => value.length > 0);
}

export function stylesheetLinks({ html }: { html: string }): string[] {
  return Array.from(html.matchAll(/<link\b[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1] ?? "")
    .filter((value) => value.length > 0);
}

export function hasEmptyRoot({ html }: { html: string }): boolean {
  return /<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i.test(html);
}

export function hasNoIndex({ html }: { html: string }): boolean {
  return /<meta[^>]+(?:name|property)=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
}

export function htmlLinks({ html }: { html: string }): string[] {
  return Array.from(html.matchAll(/<a\b[^>]+href=["']([^"'#]+)["'][^>]*>/gi))
    .map((match) => match[1] ?? "")
    .filter((value) => value.length > 0);
}
