const nf = new Intl.NumberFormat('en-IN');
export const inr = (n: number) => '₹' + nf.format(Math.round(n));
export const initials = (name: string) => name.slice(0, 2).toUpperCase();
