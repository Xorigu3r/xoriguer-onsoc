"""Genera la Guia d'On Sóc (www/index.html, dins <section id="v-guia">) i les seves traduccions (www/guia-traduccions.js).

Ús:  python -X utf8 eines/guia.py   (des de l'arrel del projecte)
Cada text va en 4 llengües [ca, es, fr, en]. Res de '&' ni '<' fora de <b>: la clau de la traducció és l'innerHTML.
"""
import json
import re
from pathlib import Path

ARREL = Path(__file__).resolve().parent.parent

INTRO = ['Toca un apartat per obrir-lo.', 'Toca un apartado para abrirlo.', 'Touchez une rubrique pour l’ouvrir.', 'Tap a section to open it.']

# (id, títol, [(etiqueta, text) ...]); etiqueta: 'ol' / 'ul' (llista: text = llista d'elements) o 'p'
G = [
  ('g-marxa', ['🚦 Posar-la en marxa', '🚦 Ponerla en marcha', '🚦 Bien démarrer', '🚦 Getting started'], [
    ('ol', [
      ['Un de casa toca <b>Crea una família nova</b> i posa el seu nom (i el telèfon, si vol).',
       'Uno de casa toca <b>Crear una familia nueva</b> y pone su nombre (y el teléfono, si quiere).',
       'Une personne de la maison touche <b>Créer une nouvelle famille</b> et met son nom (et son téléphone, si elle veut).',
       'One person taps <b>Create a new family</b> and enters their name (and phone, if they like).'],
      ['A la pestanya <b>Família</b> hi ha el <b>codi de la família</b>: passa\'l als altres (Comparteix o Copia).',
       'En la pestaña <b>Familia</b> está el <b>código de la familia</b>: pásalo a los demás (Compartir o Copiar).',
       'Dans l’onglet <b>Famille</b> se trouve le <b>code de la famille</b> : envoyez-le aux autres (Partager ou Copier).',
       'The <b>Family</b> tab shows the <b>family code</b>: send it to the others (Share or Copy).'],
      ['Els altres instal·len On Sóc, escriuen el codi i toquen <b>Uneix-me amb aquest codi</b>.',
       'Los demás instalan On Sóc, escriben el código y tocan <b>Unirme con este código</b>.',
       'Les autres installent On Sóc, saisissent le code et touchent <b>Rejoindre avec ce code</b>.',
       'The others install On Sóc, type the code and tap <b>Join with this code</b>.'],
      ['Doneu permís d\'ubicació i d\'avisos quan l\'app ho demani.',
       'Dad permiso de ubicación y de avisos cuando la app lo pida.',
       'Accordez l’accès à la position et aux notifications quand l’appli le demande.',
       'Allow location and notifications when the app asks.'],
    ]),
    ('p', ['Qui té el codi us veu a tots: passa\'l <b>només</b> als de casa.',
           'Quien tiene el código os ve a todos: pásalo <b>solo</b> a los de casa.',
           'Qui a le code vous voit tous : ne le donnez <b>qu’à</b> la famille.',
           'Anyone with the code can see all of you: give it <b>only</b> to your household.']),
  ]),
  ('g-instal', ['📲 Instal·lar l\'APK (Android)', '📲 Instalar el APK (Android)', '📲 Installer l’APK (Android)', '📲 Installing the APK (Android)'], [
    ('ol', [
      ['Baixa <b>XoriguerOnSoc.apk</b> des de la pàgina de descàrregues i obre el fitxer.',
       'Descarga <b>XoriguerOnSoc.apk</b> desde la página de descargas y abre el archivo.',
       'Téléchargez <b>XoriguerOnSoc.apk</b> depuis la page de téléchargement et ouvrez le fichier.',
       'Download <b>XoriguerOnSoc.apk</b> from the downloads page and open the file.'],
      ['Si diu que no es poden instal·lar apps d\'aquest origen: <b>Configuració</b> → activa <b>Permet d\'aquesta font</b>.',
       'Si dice que no se pueden instalar apps de este origen: <b>Ajustes</b> → activa <b>Permitir de esta fuente</b>.',
       'S’il dit que les applis de cette source sont bloquées : <b>Paramètres</b> → activez <b>Autoriser cette source</b>.',
       'If it says apps from this source can’t be installed: <b>Settings</b> → turn on <b>Allow from this source</b>.'],
      ['Si surt <b>Play Protect</b>: <b>Més detalls</b> → <b>Instal·la igualment</b>.',
       'Si sale <b>Play Protect</b>: <b>Más detalles</b> → <b>Instalar de todas formas</b>.',
       'Si <b>Play Protect</b> apparaît : <b>Plus de détails</b> → <b>Installer quand même</b>.',
       'If <b>Play Protect</b> appears: <b>More details</b> → <b>Install anyway</b>.'],
    ]),
    ('p', ['Les versions noves s\'instal·len per sobre: no es perd res.',
           'Las versiones nuevas se instalan encima: no se pierde nada.',
           'Les nouvelles versions s’installent par-dessus : rien n’est perdu.',
           'New versions install over the old one: nothing is lost.']),
  ]),
  ('g-segon-pla', ['🔋 Que funcioni amb l\'app tancada (Android)', '🔋 Que funcione con la app cerrada (Android)', '🔋 Fonctionner appli fermée (Android)', '🔋 Working with the app closed (Android)'], [
    ('ul', [
      ['<b>Ubicació</b>: «Permet sempre» (o «Mentre s\'usa l\'app»). Mentre comparteix, hi ha un avís fix a la barra: és normal i és el que la manté viva.',
       '<b>Ubicación</b>: «Permitir siempre» (o «Mientras se usa la app»). Mientras comparte, hay un aviso fijo en la barra: es normal y es lo que la mantiene viva.',
       '<b>Position</b> : « Toujours autoriser » (ou « Pendant l’utilisation »). Pendant le partage, une notification fixe reste affichée : c’est normal, c’est ce qui la garde active.',
       '<b>Location</b>: “Allow all the time” (or “While using the app”). While sharing there’s a persistent notification: that’s normal and keeps it running.'],
      ['<b>Bateria</b>: Configuració → Aplicacions → On Sóc → Bateria → <b>Sense restriccions</b>. Xiaomi, Huawei i Samsung tanquen apps si no ho fas.',
       '<b>Batería</b>: Ajustes → Aplicaciones → On Sóc → Batería → <b>Sin restricciones</b>. Xiaomi, Huawei y Samsung cierran apps si no lo haces.',
       '<b>Batterie</b> : Paramètres → Applications → On Sóc → Batterie → <b>Sans restriction</b>. Xiaomi, Huawei et Samsung ferment les applis sinon.',
       '<b>Battery</b>: Settings → Apps → On Sóc → Battery → <b>Unrestricted</b>. Xiaomi, Huawei and Samsung close apps otherwise.'],
      ['<b>Avisos</b>: permet-los (pestanya Opcions) i instal·la <b>ntfy</b> per rebre\'ls encara que On Sóc estigui tancada.',
       '<b>Avisos</b>: permítelos (pestaña Opciones) e instala <b>ntfy</b> para recibirlos aunque On Sóc esté cerrada.',
       '<b>Notifications</b> : autorisez-les (onglet Options) et installez <b>ntfy</b> pour les recevoir même appli fermée.',
       '<b>Notifications</b>: allow them (Options tab) and install <b>ntfy</b> to get them even with On Sóc closed.'],
    ]),
  ]),
  ('g-iphone', ['🍏 iPhone', '🍏 iPhone', '🍏 iPhone', '🍏 iPhone'], [
    ('p', ['A l\'iPhone, On Sóc va com a web: <b>només envia on ets mentre la tens oberta</b>. Per això ho combinem amb ntfy i Google Maps:',
           'En el iPhone, On Sóc va como web: <b>solo envía dónde estás mientras la tienes abierta</b>. Por eso lo combinamos con ntfy y Google Maps:',
           'Sur iPhone, On Sóc fonctionne comme un site web : <b>il n’envoie votre position que lorsqu’il est ouvert</b>. On le combine donc avec ntfy et Google Maps :',
           'On iPhone, On Sóc runs as a web app: <b>it only sends your location while it’s open</b>. That’s why we combine it with ntfy and Google Maps:']),
    ('ol', [
      ['Safari → botó Comparteix → <b>Afegeix a la pantalla d\'inici</b>, i entra amb el codi.',
       'Safari → botón Compartir → <b>Añadir a pantalla de inicio</b>, y entra con el código.',
       'Safari → bouton Partager → <b>Sur l’écran d’accueil</b>, puis entrez le code.',
       'Safari → Share button → <b>Add to Home Screen</b>, then join with the code.'],
      ['Instal·la <b>ntfy</b> i subscriu-te al tema de la família (Opcions).',
       'Instala <b>ntfy</b> y suscríbete al tema de la familia (Opciones).',
       'Installez <b>ntfy</b> et abonnez-vous au sujet de la famille (Options).',
       'Install <b>ntfy</b> and subscribe to the family topic (Options).'],
      ['Google Maps → la teva foto → Compartir la ubicació → «Fins que ho desactivis» → amb un enllaç. Enganxa l\'enllaç al teu perfil (Família).',
       'Google Maps → tu foto → Compartir ubicación → «Hasta que la desactives» → con un enlace. Pega el enlace en tu perfil (Familia).',
       'Google Maps → votre photo → Partager ma position → « Jusqu’à désactivation » → par lien. Collez le lien dans votre profil (Famille).',
       'Google Maps → your photo → Location sharing → “Until you turn this off” → via link. Paste the link into your profile (Family).'],
    ]),
    ('p', ['Quan et demanin «On ets?», toca l\'avís de ntfy: s\'obre On Sóc i envia on ets.',
           'Cuando te pidan «¿Dónde estás?», toca el aviso de ntfy: se abre On Sóc y envía dónde estás.',
           'Quand on vous demande « Tu es où ? », touchez l’alerte ntfy : On Sóc s’ouvre et envoie votre position.',
           'When someone asks “Where are you?”, tap the ntfy alert: On Sóc opens and sends your location.']),
  ]),
  ('g-mapa', ['🗺️ El mapa i la família', '🗺️ El mapa y la familia', '🗺️ La carte et la famille', '🗺️ The map and the family'], [
    ('ul', [
      ['Cada persona és una agulla amb el seu color i inicial. <b>En gris</b>: fa més de 30 min que no se\'n sap res.',
       'Cada persona es una chincheta con su color e inicial. <b>En gris</b>: hace más de 30 min que no se sabe nada.',
       'Chaque personne est une épingle avec sa couleur et son initiale. <b>En gris</b> : pas de nouvelles depuis plus de 30 min.',
       'Each person is a pin with their colour and initial. <b>Grey</b>: no news for more than 30 min.'],
      ['A la llista: on és («a Casa»), fa quant, a quina distància i la bateria.',
       'En la lista: dónde está («en Casa»), hace cuánto, a qué distancia y la batería.',
       'Dans la liste : où il est (« à Maison »), depuis quand, à quelle distance et la batterie.',
       'In the list: where they are (“at Home”), how long ago, how far and their battery.'],
      ['Botons: <b>Mapa</b> (centra), <b>On ets?</b> (demana la ubicació ara), <b>Recorregut</b> (7 dies), <b>Fitxa</b> (mèdica), <b>Google Maps</b>, <b>Ruta</b> i <b>Truca</b>.',
       'Botones: <b>Mapa</b> (centra), <b>¿Dónde estás?</b> (pide la ubicación ahora), <b>Recorrido</b> (7 días), <b>Ficha</b> (médica), <b>Google Maps</b>, <b>Ruta</b> y <b>Llamar</b>.',
       'Boutons : <b>Carte</b> (centrer), <b>Tu es où ?</b> (demander la position), <b>Trajet</b> (7 jours), <b>Fiche</b> (médicale), <b>Google Maps</b>, <b>Itinéraire</b> et <b>Appeler</b>.',
       'Buttons: <b>Map</b> (centre), <b>Where are you?</b> (ask for their location now), <b>Route history</b> (7 days), <b>Medical</b> (card), <b>Google Maps</b>, <b>Directions</b> and <b>Call</b>.'],
      ['El punt de dalt a la dreta: verd = comparteixes, taronja = en pausa, vermell = hi ha un problema.',
       'El punto de arriba a la derecha: verde = compartes, naranja = en pausa, rojo = hay un problema.',
       'Le point en haut à droite : vert = partage actif, orange = en pause, rouge = problème.',
       'The dot at the top right: green = sharing, orange = paused, red = something’s wrong.'],
    ]),
  ]),
  ('g-llocs', ['🏠 Llocs', '🏠 Lugares', '🏠 Lieux', '🏠 Places'], [
    ('ol', [
      ['Pestanya <b>Llocs</b> → toca el mapa on és (o <b>Usa on sóc ara</b>).',
       'Pestaña <b>Lugares</b> → toca el mapa donde está (o <b>Usar dónde estoy</b>).',
       'Onglet <b>Lieux</b> → touchez la carte à l’endroit voulu (ou <b>Utiliser ma position</b>).',
       '<b>Places</b> tab → tap the map where it is (or <b>Use where I am</b>).'],
      ['Posa-li nom (Casa, Escola...) i tria la mida de la zona.',
       'Ponle nombre (Casa, Escuela...) y elige el tamaño de la zona.',
       'Donnez-lui un nom (Maison, École...) et choisissez la taille de la zone.',
       'Give it a name (Home, School...) and choose the area size.'],
    ]),
    ('p', ['Quan algú hi arriba o en surt, la resta rep un avís. Ho detecta el mòbil de qui es mou.',
           'Cuando alguien llega o sale, el resto recibe un aviso. Lo detecta el móvil de quien se mueve.',
           'Quand quelqu’un arrive ou part, les autres sont prévenus. C’est le téléphone de la personne qui détecte.',
           'When someone arrives or leaves, the others get an alert. The phone of the person moving detects it.']),
  ]),
  ('g-acomp', ['🚶 Acompanya\'m', '🚶 Acompáñame', '🚶 Accompagne-moi', '🚶 Walk me home'], [
    ('ol', [
      ['Toca <b>Acompanya\'m</b>, tria cap a on vas i en quant de temps hi arribes.',
       'Toca <b>Acompáñame</b>, elige adónde vas y en cuánto tiempo llegas.',
       'Touchez <b>Accompagne-moi</b>, choisissez où vous allez et en combien de temps.',
       'Tap <b>Walk me home</b>, choose where you’re going and how long it’ll take.'],
      ['La família veu que vas de camí. Si arribes a un lloc desat, s\'acaba sol; si no, toca <b>Ja he arribat</b>.',
       'La familia ve que vas de camino. Si llegas a un lugar guardado, termina solo; si no, toca <b>Ya he llegado</b>.',
       'La famille voit que vous êtes en route. Si vous arrivez à un lieu enregistré, ça s’arrête tout seul ; sinon, touchez <b>Je suis arrivé</b>.',
       'Your family sees you’re on the way. If you reach a saved place it ends on its own; otherwise tap <b>I’ve arrived</b>.'],
      ['Si passa l\'hora i no dius res, el mòbil t\'avisa i, <b>2 minuts després</b>, envia un SOS automàtic.',
       'Si pasa la hora y no dices nada, el móvil te avisa y, <b>2 minutos después</b>, envía un SOS automático.',
       'Si l’heure passe sans réponse, le téléphone vous prévient puis, <b>2 minutes après</b>, envoie un SOS automatique.',
       'If the time passes and you say nothing, your phone warns you and <b>2 minutes later</b> sends an automatic SOS.'],
    ]),
  ]),
  ('g-sos', ['🆘 SOS', '🆘 SOS', '🆘 SOS', '🆘 SOS'], [
    ('ul', [
      ['Mantén premut el botó <b>SOS</b> 2 segons. La família rep l\'avís, veu on ets i la teva fitxa mèdica.',
       'Mantén pulsado el botón <b>SOS</b> 2 segundos. La familia recibe el aviso, ve dónde estás y tu ficha médica.',
       'Maintenez le bouton <b>SOS</b> appuyé 2 secondes. La famille est prévenue, voit où vous êtes et votre fiche médicale.',
       'Hold the <b>SOS</b> button for 2 seconds. Your family gets the alert and sees where you are and your medical card.'],
      ['Android: botó <b>SOS On Sóc</b> a la persiana i drecera mantenint premuda la icona. Sempre hi ha 5 segons per cancel·lar.',
       'Android: botón <b>SOS On Sóc</b> en el panel y acceso directo manteniendo pulsado el icono. Siempre hay 5 segundos para cancelar.',
       'Android : bouton <b>SOS On Sóc</b> dans les réglages rapides et raccourci par appui long sur l’icône. Toujours 5 secondes pour annuler.',
       'Android: <b>SOS On Sóc</b> button in Quick Settings and a shortcut by long-pressing the icon. There are always 5 seconds to cancel.'],
      ['Opcions → <b>SMS d\'SOS</b>: també envia un SMS amb on ets, encara que no hi hagi dades.',
       'Opciones → <b>SMS de SOS</b>: también envía un SMS con dónde estás, aunque no haya datos.',
       'Options → <b>SMS de SOS</b> : envoie aussi un SMS avec votre position, même sans données.',
       'Options → <b>SOS text message</b>: also sends a text with your location, even without data.'],
      ['Quan tot vagi bé, toca <b>Estic bé — treu l\'avís</b>. Per a una emergència de veritat: <b>112</b>.',
       'Cuando todo esté bien, toca <b>Estoy bien — quitar el aviso</b>. Para una emergencia de verdad: <b>112</b>.',
       'Quand tout va bien, touchez <b>Je vais bien — retirer l’alerte</b>. Pour une vraie urgence : <b>112</b>.',
       'When everything’s fine, tap <b>I’m OK — cancel the alert</b>. For a real emergency: <b>112</b>.'],
    ]),
  ]),
  ('g-avisos', ['🔔 Avisos', '🔔 Avisos', '🔔 Alertes', '🔔 Alerts'], [
    ('ul', [
      ['La família rep avisos de: SOS, arribades i sortides dels llocs, «estic bé», bateria baixa (15 %), acompanya\'m i «on ets?».',
       'La familia recibe avisos de: SOS, llegadas y salidas de los lugares, «estoy bien», batería baja (15 %), acompáñame y «¿dónde estás?».',
       'La famille reçoit des alertes pour : SOS, arrivées et départs des lieux, « je vais bien », batterie faible (15 %), accompagne-moi et « tu es où ? ».',
       'Your family gets alerts for: SOS, arriving at and leaving places, “I’m OK”, low battery (15%), walk me home and “where are you?”.'],
      ['Amb <b>ntfy</b> arriben encara que On Sóc estigui tancada. Hi va el nom i què ha passat, mai la ubicació.',
       'Con <b>ntfy</b> llegan aunque On Sóc esté cerrada. Va el nombre y qué ha pasado, nunca la ubicación.',
       'Avec <b>ntfy</b>, elles arrivent même si On Sóc est fermée. Seuls le nom et ce qui s’est passé y vont, jamais la position.',
       'With <b>ntfy</b> they arrive even if On Sóc is closed. Only the name and what happened are sent, never the location.'],
      ['<b>«Fa massa que no en sabem res»</b> (Opcions): si algú porta X hores sense donar senyals, el teu mòbil t\'avisa.',
       '<b>«Hace demasiado que no sabemos nada»</b> (Opciones): si alguien lleva X horas sin dar señales, tu móvil te avisa.',
       '<b>« Pas de nouvelles depuis trop longtemps »</b> (Options) : si quelqu’un ne donne pas signe de vie depuis X heures, votre téléphone vous prévient.',
       '<b>“No news for too long”</b> (Options): if someone goes X hours without any sign, your phone alerts you.'],
    ]),
  ]),
  ('g-enllac', ['🔗 Enllaç per a algú de fora', '🔗 Enlace para alguien de fuera', '🔗 Lien pour quelqu’un d’extérieur', '🔗 Link for someone outside the family'], [
    ('p', ['Toca <b>Comparteix</b> al mapa i tria 1, 8 o 24 hores. Qui tingui l\'enllaç et veu al navegador, sense instal·lar res. Caduca sol i el pots aturar quan vulguis.',
           'Toca <b>Compartir</b> en el mapa y elige 1, 8 o 24 horas. Quien tenga el enlace te ve en el navegador, sin instalar nada. Caduca solo y puedes pararlo cuando quieras.',
           'Touchez <b>Partager</b> sur la carte et choisissez 1, 8 ou 24 heures. Qui a le lien vous voit dans le navigateur, sans rien installer. Il expire tout seul et vous pouvez l’arrêter à tout moment.',
           'Tap <b>Share</b> on the map and pick 1, 8 or 24 hours. Anyone with the link sees you in their browser, nothing to install. It expires on its own and you can stop it any time.']),
  ]),
  ('g-privadesa', ['🔒 Privadesa', '🔒 Privacidad', '🔒 Confidentialité', '🔒 Privacy'], [
    ('ul', [
      ['Tot el que va al servidor va <b>xifrat amb el codi de la família</b>: el servidor no sap ni noms ni llocs.',
       'Todo lo que va al servidor va <b>cifrado con el código de la familia</b>: el servidor no sabe ni nombres ni lugares.',
       'Tout ce qui va au serveur est <b>chiffré avec le code de la famille</b> : le serveur ne connaît ni noms ni lieux.',
       'Everything sent to the server is <b>encrypted with the family code</b>: the server knows no names or places.'],
      ['Sense comptes ni anuncis. El recorregut i els avisos s\'esborren sols als 7 dies.',
       'Sin cuentas ni anuncios. El recorrido y los avisos se borran solos a los 7 días.',
       'Sans compte ni publicité. Le trajet et les alertes s’effacent tout seuls après 7 jours.',
       'No accounts, no ads. Route history and alerts delete themselves after 7 days.'],
      ['Pots posar la ubicació en pausa (Opcions): la família veu que has pausat, però no on ets.',
       'Puedes poner la ubicación en pausa (Opciones): la familia ve que has pausado, pero no dónde estás.',
       'Vous pouvez mettre la position en pause (Options) : la famille voit la pause, pas où vous êtes.',
       'You can pause your location (Options): your family sees you’ve paused, but not where you are.'],
      ['Si el codi s\'escampa: tothom <b>Surt de la família</b> i en creeu una de nova.',
       'Si el código se filtra: todos <b>Salir de la familia</b> y cread una nueva.',
       'Si le code fuite : tout le monde <b>Quitte la famille</b> et vous en créez une nouvelle.',
       'If the code leaks: everyone taps <b>Leave the family</b> and you create a new one.'],
    ]),
  ]),
  ('g-actualitza', ['⬆️ Actualitzacions', '⬆️ Actualizaciones', '⬆️ Mises à jour', '⬆️ Updates'], [
    ('p', ['L\'app d\'Android mira sola un cop al dia si hi ha versió nova i t\'avisa al mapa. També pots tocar <b>Busca actualitzacions</b> (Opcions). La web s\'actualitza sola.',
           'La app de Android mira sola una vez al día si hay versión nueva y te avisa en el mapa. También puedes tocar <b>Buscar actualizaciones</b> (Opciones). La web se actualiza sola.',
           'L’appli Android vérifie seule une fois par jour s’il y a une nouvelle version et vous prévient sur la carte. Vous pouvez aussi toucher <b>Rechercher des mises à jour</b> (Options). La version web se met à jour toute seule.',
           'The Android app checks once a day for a new version and tells you on the map. You can also tap <b>Check for updates</b> (Options). The web version updates itself.']),
  ]),
  ('g-problemes', ['❓ Si alguna cosa no va', '❓ Si algo no funciona', '❓ Si quelque chose ne marche pas', '❓ If something doesn’t work'], [
    ('ul', [
      ['<b>No em veuen</b>: mira que el punt de dalt sigui verd, el permís d\'ubicació i la bateria «Sense restriccions».',
       '<b>No me ven</b>: mira que el punto de arriba sea verde, el permiso de ubicación y la batería «Sin restricciones».',
       '<b>On ne me voit pas</b> : vérifiez que le point en haut est vert, l’autorisation de position et la batterie « Sans restriction ».',
       '<b>They can’t see me</b>: check the dot at the top is green, the location permission and battery “Unrestricted”.'],
      ['<b>No em surten els avisos</b>: permet els avisos (Opcions) i comprova que a ntfy estàs subscrit al tema de la família.',
       '<b>No me salen los avisos</b>: permite los avisos (Opciones) y comprueba que en ntfy estás suscrito al tema de la familia.',
       '<b>Je ne reçois pas les alertes</b> : autorisez les notifications (Options) et vérifiez votre abonnement au sujet de la famille dans ntfy.',
       '<b>I don’t get alerts</b>: allow notifications (Options) and check you’re subscribed to the family topic in ntfy.'],
      ['<b>Surt en un altre idioma</b>: Opcions → Idioma.',
       '<b>Sale en otro idioma</b>: Opciones → Idioma.',
       '<b>C’est dans une autre langue</b> : Options → Langue.',
       '<b>It’s in another language</b>: Options → Language.'],
    ]),
  ]),
]


def html():
    out = ['      <h2>Guia</h2>', f'      <p class="suau">{INTRO[0]}</p>', '']
    for gid, titol, cos in G:
        out.append(f'      <details id="{gid}">')
        out.append(f'        <summary>{titol[0]}</summary>')
        for etiqueta, contingut in cos:
            if etiqueta in ('ol', 'ul'):
                out.append(f'        <{etiqueta}>')
                out += [f'          <li>{x[0]}</li>' for x in contingut]
                out.append(f'        </{etiqueta}>')
            else:
                out.append(f'        <p>{contingut[0]}</p>')
        out.append('      </details>')
    return '\n'.join(out)


def files():
    f = [INTRO, ['Guia', 'Guía', 'Guide', 'Guide']]
    for _, titol, cos in G:
        f.append(titol)
        for etiqueta, contingut in cos:
            f += contingut if etiqueta in ('ol', 'ul') else [contingut]
    return f


if __name__ == '__main__':
    idx = ARREL / 'www/index.html'
    t = idx.read_text(encoding='utf-8')
    t, n = re.subn(r'(<section id="v-guia" class="vista guia">)(.*?)(\n    </section>)',
                   lambda m: m.group(1) + '\n' + html() + m.group(3), t, flags=re.S)
    assert n == 1
    idx.write_text(t, encoding='utf-8')
    for x in files():
        assert len(x) == 4 and '&' not in ''.join(x), x
    js = ("/* Generat per eines/guia.py: traduccions de la Guia [ca, es, fr, en]. No l\'editis a mà. */\n\'use strict';\n"
          "(function (g) {\n  const F = " + json.dumps(files(), ensure_ascii=False, indent=1) + ";\n"
          "  const norm = (s) => String(s).replace(/\\s+/g, ' ').trim();\n"
          "  const TR = g.TR || (g.TR = { es: {}, fr: {}, en: {} });\n"
          "  for (const [ca, es, fr, en] of F) { const k = norm(ca); TR.es[k] = es; TR.fr[k] = fr; TR.en[k] = en; }\n"
          "})(typeof window !== 'undefined' ? window : globalThis);\n")
    (ARREL / 'www/guia-traduccions.js').write_text(js, encoding='utf-8')
    print('Guia:', len(G), 'apartats,', len(files()), 'textos')
