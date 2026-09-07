const API_URL = import.meta.env.VITE_API_URL;

export async function getHello() {
  const res = await fetch(`${API_URL}/api/hello`);
  if (!res.ok) throw new Error('Failed to reach backend');
  return res.json();
}