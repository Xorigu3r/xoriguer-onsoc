// Copia a www/ les llibreries que van dins l'app (sense CDN): Capacitor i Leaflet.
import { copyFileSync, mkdirSync, cpSync } from 'node:fs';
mkdirSync('www/lib', { recursive: true });
copyFileSync('node_modules/@capacitor/core/dist/capacitor.js', 'www/capacitor.js');
copyFileSync('node_modules/leaflet/dist/leaflet.js', 'www/lib/leaflet.js');
copyFileSync('node_modules/leaflet/dist/leaflet.css', 'www/lib/leaflet.css');
cpSync('node_modules/leaflet/dist/images', 'www/lib/images', { recursive: true });
console.log('Llibreries copiades a www/');
