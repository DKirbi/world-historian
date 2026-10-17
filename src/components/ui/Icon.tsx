const PATHS = {
  search:
    'M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.43 1.06-1.06-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  plus: 'M11.25 5h1.5v6.25H19v1.5h-6.25V19h-1.5v-6.25H5v-1.5h6.25V5Z',
  minus: 'M5 11.25h14v1.5H5z',
  fit: 'M4 4h6v1.5H5.5V10H4V4Zm10 0h6v6h-1.5V5.5H14V4ZM4 14h1.5v4.5H10V20H4v-6Zm14.5 0H20v6h-6v-1.5h4.5V14Z',
  close:
    'm6.53 5.47 5.47 5.47 5.47-5.47 1.06 1.06L13.06 12l5.47 5.47-1.06 1.06L12 13.06l-5.47 5.47-1.06-1.06L10.94 12 5.47 6.53l1.06-1.06Z',
  external: 'M13 4h7v7h-1.5V6.56l-7.22 7.22-1.06-1.06 7.22-7.22H13V4ZM5 7h6v1.5H6.5v9h9V13H17v6H5V7Z',
  sun: 'M11.25 2h1.5v3h-1.5V2Zm0 17h1.5v3h-1.5v-3ZM2 11.25h3v1.5H2v-1.5Zm17 0h3v1.5h-3v-1.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM4.4 5.46 5.46 4.4l2.12 2.12-1.06 1.06L4.4 5.46Zm12.02 12.02 1.06-1.06 2.12 2.12-1.06 1.06-2.12-2.12ZM4.4 18.54l2.12-2.12 1.06 1.06-2.12 2.12-1.06-1.06Zm12.02-12.02 2.12-2.12 1.06 1.06-2.12 2.12-1.06-1.06Z',
  moon: 'M10.2 3.1A9 9 0 1 0 20.9 13.8 7.5 7.5 0 0 1 10.2 3.1Zm-1.8 2.24a9 9 0 0 0 10.26 10.26A7.5 7.5 0 1 1 8.4 5.34Z',
  system: 'M3 5h18v11H3V5Zm1.5 1.5v8h15v-8h-15ZM8 18.5h8V20H8v-1.5Z',
  list: 'M4 6h2v2H4V6Zm4 .25h12v1.5H8v-1.5ZM4 11h2v2H4v-2Zm4 .25h12v1.5H8v-1.5ZM4 16h2v2H4v-2Zm4 .25h12v1.5H8v-1.5Z',
  chevron: 'm6.53 8.97 5.47 5.47 5.47-5.47 1.06 1.06L12 16.56l-6.53-6.53 1.06-1.06Z',
  check: 'm9.5 15.44 9.47-9.47 1.06 1.06L9.5 17.56l-5.53-5.53 1.06-1.06 4.47 4.47Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
