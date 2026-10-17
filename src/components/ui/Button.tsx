import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import s from './Button.module.scss';

type Variant = 'default' | 'ghost' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  trailingIcon?: IconName;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', icon, trailingIcon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={[s.button, s[variant], className].filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children && <span className={s.label}>{children}</span>}
      {trailingIcon && <Icon name={trailingIcon} size={16} />}
    </button>
  );
});

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Accessible name; also shown as the native tooltip. */
  label: string;
  variant?: Variant;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={[s.button, s.iconOnly, s[variant], className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name={icon} size={18} />
    </button>
  );
});
