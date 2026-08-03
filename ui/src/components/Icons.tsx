import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement>;
const Icon = ({ children, ...props }: Props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
export const MenuIcon = (p: Props) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
export const SearchIcon = (p: Props) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon>;
export const SaveIcon = (p: Props) => <Icon {...p}><path d="M5 4h12l2 2v14H5z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></Icon>;
export const PublishIcon = (p: Props) => <Icon {...p}><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></Icon>;
export const HistoryIcon = (p: Props) => <Icon {...p}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v5l3 2" /></Icon>;
export const TrashIcon = (p: Props) => <Icon {...p}><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7M10 11v5m4-5v5" /></Icon>;
export const ExternalIcon = (p: Props) => <Icon {...p}><path d="M14 5h5v5M19 5l-8 8" /><path d="M18 13v6H5V6h6" /></Icon>;
export const ChevronIcon = (p: Props) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>;
export const CloseIcon = (p: Props) => <Icon {...p}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
export const GripIcon = (p: Props) => <Icon {...p}><circle cx="9" cy="6" r=".6" fill="currentColor" /><circle cx="15" cy="6" r=".6" fill="currentColor" /><circle cx="9" cy="12" r=".6" fill="currentColor" /><circle cx="15" cy="12" r=".6" fill="currentColor" /><circle cx="9" cy="18" r=".6" fill="currentColor" /><circle cx="15" cy="18" r=".6" fill="currentColor" /></Icon>;
