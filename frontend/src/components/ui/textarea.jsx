import React from 'react';

/**
 * Textarea Component
 * Simple textarea with variant support
 */
export const Textarea = ({ 
  placeholder,
  value,
  onChange,
  className = '',
  disabled = false,
  rows = 4,
  ...props 
}) => {
  const baseClasses = 'flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical';
  
  const disabledClasses = 'opacity-50 cursor-not-allowed';
  
  const classes = `${baseClasses} ${disabled ? disabledClasses : ''} ${className}`;
  
  return (
    <textarea
      className={classes}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      rows={rows}
      {...props}
    />
  );
};