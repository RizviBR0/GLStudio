/**
 * Adapted from GAIA UI RaisedButton (MIT), The Experience Company, 2026.
 * https://github.com/theexperiencecompany/gaia-ui/blob/main/registry/new-york/ui/raised-button.tsx
 * Uses local CSS and a solid fill; includes no gradient overlay.
 * License: /third-party/gaia-ui-LICENSE.txt
 */
import { forwardRef, useMemo, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { getButtonColorStyles } from './raised-button-colors';
import './raised-button.css';

export interface RaisedButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  size?: 'sm' | 'default' | 'lg' | 'icon';
  color?: string;
}

export const RaisedButton = forwardRef<HTMLButtonElement, RaisedButtonProps>(function RaisedButton(
  { size = 'default', color, type = 'button', className = '', style, ...props }, ref,
) {
  const colors = useMemo(() => color ? getButtonColorStyles(color) : {}, [color]);
  return <button ref={ref} type={type} className={`raised-button raised-button--${size} ${className}`}
    style={{ ...colors, ...style } as CSSProperties} {...props} />;
});
