export interface TeamPreviewTarget {
  index: number;
  name: string;
  x: number;
  y: number;
  area: number;
  position: {x: number; y: number};
}
/** Pure read-only DOM observation; returns null if no safe card is hittable. */
export function teamPreviewTarget(rail: Element): TeamPreviewTarget | null;
