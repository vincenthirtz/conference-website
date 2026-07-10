// components/admin/Th.tsx
// Shared table header cell. Renders a <th> with scope="col" by default so
// screen readers can associate headers with their column (a11y). Every prop
// is passed through to the underlying <th>, so it's a drop-in replacement for
// a bare <th> element (className, colSpan, onClick, etc. all work as usual).

import type { ThHTMLAttributes } from 'react';

type ThProps = ThHTMLAttributes<HTMLTableCellElement>;

export default function Th({ scope = 'col', children, ...rest }: ThProps) {
  return (
    <th scope={scope} {...rest}>
      {children}
    </th>
  );
}
