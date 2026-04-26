export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            ink: '#0f172a',
            mist: '#64748b'
          },
          boxShadow: {
            soft: '0 12px 28px rgba(15,23,42,0.08)'
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: "Manrope", ui-sans-serif, system-ui, sans-serif; }
  </style>
</head>
<body class="min-h-screen bg-slate-100 text-ink">
  <div class="min-h-screen bg-[radial-gradient(circle_at_top_right,_#dbeafe_0%,_#f8fafc_38%,_#f1f5f9_100%)]">
    <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    ${body}
    </div>
  </div>
</body>
</html>`;
}
