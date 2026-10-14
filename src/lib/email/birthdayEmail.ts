import { WINDOW_ICON } from '@/lib/core/labels';
import type { DateWindow } from '@/lib/core/specialDates';
import type { Benefit, Snapshot } from '@/lib/core/types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** One e-mail for every special date that opened this month (birthday, club birthday, anniversary, children). */
export function buildDateEmail(
  sections: { window: DateWindow; benefits: Benefit[] }[],
  data: Pick<Snapshot, 'programs' | 'stores'>,
  appUrl: string,
): { subject: string; html: string } {
  const programName = new Map(data.programs.map((p) => [p.id, p.name]));
  const storeName = new Map(data.stores.map((s) => [s.id, s.name_he]));
  const total = sections.reduce((n, s) => n + s.benefits.length, 0);

  const body = sections
    .map(({ window, benefits }) => {
      const byProgram = new Map<string, Benefit[]>();
      for (const b of benefits) byProgram.set(b.program_id, [...(byProgram.get(b.program_id) ?? []), b]);
      const groups = [...byProgram]
        .map(([programId, list]) => {
          const items = list
            .map((b) => {
              const store = b.store_id ? storeName.get(b.store_id) : undefined;
              return `<li>${esc(b.title)}${store ? ` — ${esc(store)}` : ''}</li>`;
            })
            .join('');
          return `<h3>${esc(programName.get(programId) ?? '')}</h3><ul>${items}</ul>`;
        })
        .join('');
      return `<h2>${WINDOW_ICON[window.kind]} ${esc(window.label)}</h2>${groups}`;
    })
    .join('');

  return {
    subject: `🎉 ${total} הטבות לתאריכים מיוחדים מחכות לכם החודש`,
    html:
      `<div dir="rtl" style="font-family:Arial,sans-serif">` +
      `<p>החודש נפתחו הטבות לתאריכים המיוחדים שלכם:</p>` +
      body +
      `<p><a href="${esc(appUrl)}/benefits?birthday=1">לכל ההטבות באפליקציה</a></p></div>`,
  };
}
