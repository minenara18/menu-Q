export const tokens = {
  light: { bg: '#FAF6EF', surface: '#FFFFFF', ink: '#1C1917', accent: '#FF5A1F', bar: '#2563EB', kitchen: '#EA580C', pastry: '#9333EA' },
  dark: { bg: '#131110', surface: '#1E1B18', ink: '#FAF6EF', accent: '#FF5A1F' },
  status: { ordered: '#EAB308', in_progress: '#2563EB', ready: '#16A34A', completed: '#6B7280', cancelled: '#DC2626' },
};
export const formatIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
