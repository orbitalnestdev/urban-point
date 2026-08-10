import fs from 'fs';

const content = fs.readFileSync('public/nodos.csv', 'utf8');
const lines = content.split('\n').filter(l => l.trim());

const parsed = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  let parts = [];
  let inQuotes = false;
  let current = '';
  for (let c of line) {
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(current.trim());

  const puesto = parts[0] || '';
  const calle = parts[1] || '';
  const altura = parts[2] || '';

  parsed.push({ id: i, puesto, calle, altura });
}

console.log('📊 Total de nodos en CSV:', parsed.length);
console.log('Muestra de los primeros 10 nodos:');
console.log(parsed.slice(0, 10));

const missingCalle = parsed.filter(p => !p.calle);
const alturaCero = parsed.filter(p => !p.altura || p.altura === '0');
const conFaltaCalle = parsed.filter(p => p.calle.includes('FALTA CALLE'));

console.log('Sin nombre de calle:', missingCalle.length);
console.log('Con altura 0 o sin altura:', alturaCero.length);
console.log('Con texto "FALTA CALLE":', conFaltaCalle.length);

console.log('\nMuestra de nodos con altura 0 o particularidades:');
console.log(alturaCero.slice(0, 10));
