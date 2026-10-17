/**
 * Artifact build only: maps the automatic JSX runtime onto the global React
 * loaded from the CDN (React 18 ships no UMD build of react/jsx-runtime).
 */
import React from 'react';

type Props = Record<string, unknown> & { children?: unknown };

function create(type: React.ElementType, props: Props, key: React.Key | undefined, isStatic: boolean) {
  const { children, ...rest } = props ?? {};
  if (key !== undefined) (rest as Props).key = key;
  if (children === undefined) return React.createElement(type, rest);
  if (isStatic && Array.isArray(children)) return React.createElement(type, rest, ...(children as React.ReactNode[]));
  return React.createElement(type, rest, children as React.ReactNode);
}

export const jsx = (type: React.ElementType, props: Props, key?: React.Key) => create(type, props, key, false);
export const jsxs = (type: React.ElementType, props: Props, key?: React.Key) => create(type, props, key, true);
export const Fragment = React.Fragment;
