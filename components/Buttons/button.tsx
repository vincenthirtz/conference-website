import React from 'react';
import type { ButtonType, IButton } from '../../types/components';

function Button({
  className,
  children,
  overlay,
  onClick,
  type,
  disabled,
  test,
  size = 'default',
  as = 'button',
  href,
  target,
  rel,
}: IButton): React.JSX.Element {
  const sizeClasses =
    size === 'compact' ? 'h-auto px-4 py-2' : 'h-[54px] px-[12px]';
  const sharedClass = `${overlay ? '' : 'gradient-bg'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} flex items-center justify-center text-white rounded-md ${sizeClasses} ${className}`;

  if (as === 'link') {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        data-test={test || ''}
        className={sharedClass}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      disabled={disabled}
      data-test={test || ''}
      type={type}
      onClick={onClick}
      className={sharedClass}
    >
      {children}
    </button>
  );
}

export default Button;
