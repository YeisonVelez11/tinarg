const express = require('express');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const { google } = require('googleapis');
const streamifier = require('streamifier');
//const moment = require('moment');
const moment = require('moment-timezone');
const fechaHoraArgentina = moment.tz("America/Argentina/Buenos_Aires");
const momentArgentina = (date, format) => {
    // Si se proporciona una fecha y un formato, interpretar según el formato dado
    if (date) {
        return moment.tz(date, format || moment.ISO_8601, 'America/Argentina/Buenos_Aires');
    }
    // Si no se proporciona fecha, devuelve la fecha y hora actual en Argentina
    return moment.tz('America/Argentina/Buenos_Aires');
}




const fs = require('fs');
const puppeteer = require('puppeteer');
//const apikeys = require('./credentials.json');
const { createCanvas, loadImage, registerFont } = require('canvas');
const locateChrome = require('locate-chrome');
const fsp = require('fs/promises');

// prod
const idCarpetaJsones = "1Q2KVljIzyURbRMUtsYJif6GSEbSIaUzk";
const idCarpetaRaiz = '1JzJRrZ-404xkgoLTdgelPdXF_MqGuLx-';
const idCarpetaBanners = "1IdL69welOFSGpOmVX_3Y-wpOH60Go9z5";
const fileJsonPasado = "1DuZ6LaMzWquaISQRURsJ7VAqUUkSBBbb";



//prueba
/*const idCarpetaJsones = "1YXZ9RaTBwNh4-JJSBJBg4dsr2bIf1KQ0";
const idCarpetaRaiz = '1LFO6UvWfam7KJSVRfGKlijv8eRLYVoD1';
const idCarpetaBanners = "1rcCJ8bsaxd4VhTSA1TjiI1GEpFy_XJ6G";
*/
// Registrar la fuente
registerFont(path.join(__dirname, "public",'fonts', 'HelveticaNeue.ttf'), { family: 'Helvetica Neue' });
registerFont(path.join(__dirname, "public", 'fonts', 'SanFrancisco.ttf'), { family: 'San Francisco' });
const storageFilePath = path.join(__dirname, 'storage.txt');

async function getPreviousHref() {
    if (fs.existsSync(storageFilePath)) {
        return fs.readFileSync(storageFilePath, 'utf-8');
    }
    return null;
}
async function saveCurrentHref(href) {
    fs.writeFileSync(storageFilePath, href, 'utf-8');
}

function formatDateFromHref(href) {
    const match = href.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//); // Extraer fecha del href
    if (match) {
        const year = match[1].slice(-2); // Obtener solo los últimos dos dígitos del año
        const month = parseInt(match[2], 10); // Mes entre 1-12 (convertido a número)
        const day = match[3];

        return {
            day: day,
            month: month, // El mes en formato numérico entre 1-12
            year: year    // El año en formato de 2 dígitos
        };
    }
    return null; // Retornar null si no se encuentra el formato
}


const app = express();
const port = 3000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
require('dotenv').config(); // Cargar variables de entorno

async function authorize() {
    const jwtClient = new google.auth.JWT(
        process.env.GOOGLE_CLIENT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/drive']
    );

    await jwtClient.authorize();
    console.log('Successfully connected to Google Drive API.');
    return jwtClient;

}
let auth;
/*(async()=>{
    auth = await authorize();
    await obtenerJsonHrefPasados();
    agregarHrefJson();
})()*/

async function listFolders(auth, parentId) {
    const drive = google.drive({ version: 'v3', auth });
    const response = await drive.files.list({
        q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
    });
    return response.data.files;
}


async function findFileByName(auth, folderId, fileName) {
    const drive = google.drive({ version: 'v3', auth });
    const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    
    const response = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        pageSize: 1,
    });

    return response.data.files.length > 0 ? response.data.files[0] : null;
}

async function uploadBufferToDrive(auth, folderId, fileName, buffer, mimeType) {
    const drive = google.drive({ version: 'v3', auth });
    
    // Buscar el archivo existente por nombre en la carpeta especificada
    const existingFile = await findFileByName(auth, folderId, fileName);

    const media = {
        mimeType: mimeType,
        body: streamifier.createReadStream(buffer),
    };

    if (existingFile) {
        // Si existe, actualizamos el archivo
        const response = await drive.files.update({
            fileId: existingFile.id,
            media: media,
            fields: 'id',
        });
        return response.data.id; // ID del archivo actualizado
    } else {
        // Si no existe, creamos un nuevo archivo
        const fileMetadata = {
            name: fileName,
            parents: [folderId],
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });
        return response.data.id; // ID del nuevo archivo creado
    }
}

async function uploadFileToDrive(auth, folderId, fileName, fileBuffer, mimeType) {
    const drive = google.drive({ version: 'v3', auth });
    const fileMetadata = {
        name: fileName,
        parents: [folderId],
    };

    const media = {
        mimeType: mimeType,
        body: streamifier.createReadStream(fileBuffer),
    };

    const existingFilesResponse = await drive.files.list({
        q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
    });

    const existingFiles = existingFilesResponse.data.files;

    for (const file of existingFiles) {
        await drive.files.delete({
            fileId: file.id,
        });
    }

    const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
    });

    return response.data.id;
}

async function waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const device_celular = {
    width:355,
    height:667
}


// Función para procesar el archivo JSON
async function agregarHrefJson(hrefJson) {
    try {
        const drive = google.drive({ version: 'v3', auth });

        // 1. Obtener el archivo JSON
        const response = await drive.files.get({
            fileId: fileJsonPasado,
            alt: 'media'
        });

        // 2. Parsear el contenido a JSON
        let contenidoActual;
        if (typeof response.data === 'string') {
            contenidoActual = JSON.parse(response.data);
        } else {
            contenidoActual = response.data; // asumiendo que ya es un objeto
        }
        // 3. Verificar que el contenido sea un arreglo
        if (!Array.isArray(contenidoActual)) {
            console.error("El contenido del archivo JSON no es un arreglo.");
            return;
        }
        const hrefExistente = contenidoActual.some(item => item.href === hrefJson.href);

        if (hrefExistente) {
            console.log(`El href "${hrefExistente.href}" ya existe. No se guardará nada.`);
            return; // Salir de la función si el nombre no es único
        }

        // 4. Agregar el nuevo registro al inicio del arreglo
        contenidoActual.unshift(hrefJson);

        // 5. Convertir de nuevo a JSON
        const jsonModificado = JSON.stringify(contenidoActual, null, 2);

        // 6. Subir el archivo modificado
        await drive.files.update({
            fileId: fileJsonPasado,
            media: {
                mimeType: 'application/json',
                body: jsonModificado,
            },
            fields: 'id'
        });

        console.log('Registro agregado exitosamente.');
    } catch (error) {
        console.error('Error al procesar el archivo JSON:', error.message);
    }
}
async function obtenerJsonHrefPasados() {
    try {
        const drive = google.drive({ version: 'v3', auth });

        // 1. Obtener el archivo JSON
        const response = await drive.files.get({
            fileId: fileJsonPasado,
            alt: 'media'
        });

        let contenidoActual;
        if (typeof response.data === 'string') {
            contenidoActual = JSON.parse(response.data);
        } else {
            contenidoActual = response.data; // asumiendo que ya es un objeto
        }

        // 3. Verificar que el contenido sea un arreglo
        if (!Array.isArray(contenidoActual)) {
            console.error("El contenido del archivo JSON no es un arreglo.");
            return [];
        }
        return contenidoActual;
    } catch (error) {
        console.error('Error al procesar el archivo JSON:', error.message);
    }
}


let intentos = 0;
let hayError = false;
let currentHref;
let page;
async function newNotice(page){
    console.log("fecha actual");
    await page.goto('https://revistaforum.com.br/', { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: 60000 });
    currentHref = await page.evaluate(() => {
        const element = document.querySelector('.z-foto a');
        return element ? element.href : null;
    });
}
async function captureScreenshotAndUpload(folderId, auth, banner1Url, bannerLateralUrl, datePast, device) {
    currentHref = null;
  

    const browser = await puppeteer.launch({
        args: [
          "--disable-setuid-sandbox",
          "--no-sandbox",
          "--single-process",
          "--no-zygote",
        ],
        headless: "true",
        executablePath:
          process.env.NODE_ENV === "production"
            ? process.env.PUPPETEER_EXECUTABLE_PATH
            : puppeteer.executablePath(),
      });
 


    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    try {
        hayError = false;

        console.log("aqui");
        console.log("datePast",datePast);
        if(datePast){
            console.log("dias pasados");
            const formattedDate = momentArgentina(datePast, 'MM/DD/YYYY').format('YYYY/M/DD'); //diferente para el buscador 2024/7/23
            let jsonData;
            try {
                // Lee el archivo JSON de manera asíncrona
                // const data = await fsp.readFile('./public/noticias.json', 'utf8');
                // Convierte el contenido a un objeto JSON
                //const elements = JSON.parse(data);
                    const elements = await obtenerJsonHrefPasados();

                    const isDateEqual = (urlString, dateToCompare) => {
                        // Expresión regular para coincidir con fechas en formato YYYY/MM/DD
                        const dateRegex = /(\d{4})\/(\d{1,2})\/(\d{1,2})/;
                        const match = urlString.match(dateRegex);
                        
                        if (match) {
                    
                            // Extraer la fecha de la URL
                            const extractedDate = `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')}`;
                    
                            // Normalizar la fecha a comparar
                            const parts = dateToCompare.split('/'); // Asumiendo que dateToCompare está en formato YYYY/MM/DD
                            const normalizedDateToCompare = `${parts[0]}/${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}`;
    
                            // Comparar las fechas normalizadas
                            return extractedDate === normalizedDateToCompare;
                        } else {
                            return false;
                        }
                    };
    
    
    
                    
                    if(elements.length > 0){
                        for(let element of elements){
                            if(element && isDateEqual(element.href, formattedDate)){
                                currentHref = element.href;
                                console.log("encontrada fecha");
                                break;
                            }  
                        }
                    }
                    if(!currentHref){
                        await newNotice(page);
                    }
            
                console.log("currentHref",currentHref);


            } catch (err) {
                console.error('Error al leer el archivo:', err);
            }


        }
        else{
            await newNotice(page);
        }

      
        if(currentHref){
            console.log("sigue");
            await agregarHrefJson({href: currentHref});
            if(!folderId){
                await page.close();
                await browser.close();
                return ;
            }
            console.log(currentHref);
            //await saveCurrentHref(currentHref);
            console.log("navegando a la url de la noticia");
            try {
                try {
                    console.log("1 intento navegando a la url de la noticia");
                    await page.goto(currentHref, { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: 120000 }); // Increased timeout to 120s
                } catch (error) {
                    console.log("Navigation timeout or error, retrying with less strict waitUntil...", error.message);
                    try {
                        console.log("2 intento navegando a la url de la noticia");
                        await page.goto(currentHref, { waitUntil: 'domcontentloaded', timeout: 120000 });
                    } catch (err) {
                        console.log("Second navigation attempt failed:", err.message);
                        throw err; // Let the outer try/catch handle this
                    }
                }
                //await waitFor(5000);

                if(device !== 'celular'){
                    //await page.waitForSelector('.main-photo img'); // Usa el selector adecuado para tu imagen
                    //evitar imagen gris
                    /*const imagenGris = await page.evaluate(() => {
                        const imagen = document.querySelector(".main-photo img");
                        if(imagen){
                            const src = imagen.src;
                            const amp = document.querySelector("figure amp-img");
                            if(amp){
                                amp.attributes.src = src;
                                imagen.src = src;
                            }
                        }
                    });*/

                }

            } catch (error) {
                console.error("Error navegando a la URL:", error);
            }

            if(device === 'celular'){
                await page.setViewport({
                    width: device_celular.width,
                    height: device_celular.height,
                    isMobile: true, // Esto simula un dispositivo móvil
                    hasTouch: true, // Esto simula que el dispositivo tiene pantalla táctil
                });
            }
            else{
                
                await page.setViewport({ width: 1592, height: 900 });
            }
        


//            await waitFor(60000);
            console.log("vamos 133");
    
            await page.evaluate((device) => {

                document.querySelectorAll('iframe').forEach(iframe => {
                    iframe.remove();
                });
                
                // Remove all swg-popup-background elements
                document.querySelectorAll('swg-popup-background').forEach(popup => {
                    popup.remove();
                });
          
                document.querySelectorAll('ins').forEach(popup => {
                    popup.remove();
                });

                document.querySelectorAll('div[data-open-link-in-same-page]').forEach(popup => {
                    popup.remove();
                });
                

                const adds = document.querySelectorAll(".content-banner.hidden-m");
                adds.forEach(add => add.style.opacity = 0);

                if(adds.length === 0 && device !== "celular"){
                    const header = document.querySelector(".main-article--header");
                    //si no hay publicidades movemos el titulo hacia abajo para poner el banner
                    if(header){
                        header.style["margin-top"] = "275px";
                    }
                }

                const adds2 = document.querySelectorAll(".content-banner");
                adds2.forEach(add => add.style.opacity = 0);

                const campana = document.querySelectorAll(".amp-web-push_container");
                campana.forEach(add => add.style.opacity = 0);
                //en celular no se debe ver la imagen
                if(device === 'celular'){
                    document.querySelector(".main-photo").style.opacity = 0
                }
               
            },device);
            console.log("vamos 1");
            await waitFor(10000);

            const screenshotBuffer = await page.screenshot();
            // Procesar la imagen final enviando banner1 y banner_costado
            console.log("dando 10 seg mientras toma imagen");
            const finalImageBuffer = await processImage(screenshotBuffer, currentHref, banner1Url, bannerLateralUrl, device); // Aquí pasamos las URLs
            console.log("vamos 4341");
    
            const dateDetails = formatDateFromHref(currentHref); // Obtén las partes de la fecha
            console.log("vamos 1445");
    
            if (dateDetails) {
                const day = dateDetails.day;
                const monthNum = dateDetails.month; // Este será un número, como 9 para septiembre
                const year = dateDetails.year;
    
                // Crear el nombre del archivo
                console.log("vamos 1232");

                const finalFileName = `${day}_${monthNum}_${year}__${!device ? 'desktop' : device}_.png`;
                await uploadBufferToDrive(auth, folderId, `${finalFileName}`, finalImageBuffer, 'image/png');
                console.log("vamos 321");
    
                console.log(`Imagen final guardada en Google Drive con el nombre ${finalFileName}`);
            } else {
                console.error('No se pudo extraer la fecha del HREF:', currentHref);
            }
        }
        else{
            console.log("no se obtuvo el href",currentHref);
        }
        intentos = 0;
        await page.close();
    } 
    catch(e){
        console.log("reeeintenta",e );
        const screenshotBuffer = await page.screenshot();
        const moment_date = momentArgentina(new Date(datePast ? datePast : new Date()),'DD_MM_YYYY').format('DD/MM/YYYY');
        const hora = momentArgentina(new Date(),'hh_mm_ss').format('hh_mm_ss');
        const finalFileName = `${moment_date}_${hora}_${device}_.png`;
        await uploadBufferToDrive(auth, idCarpetaRaiz, `${finalFileName}`, screenshotBuffer, 'image/png');

        hayError = true;
        intentos++;
    }
    finally {
        await browser.close();
        if(hayError && intentos <= 3){
            if(intentos === 3){
                intentos = 0;
            }
            else{
                await captureScreenshotAndUpload(folderId, auth, banner1Url, bannerLateralUrl, datePast, device);
            }
            hayError = false;
        }
    }
}
async function processImage(screenshotBuffer, href, banner1Url, bannerLateralUrl, device) {
    let canvasWidth; 
    let canvasHeight;
    console.log("DEVICE", device);
    if(device === 'celular'){
        canvasWidth = device_celular.width;
        canvasHeight = device_celular.height;
        console.log("resolution celular");
    }
    else{
        canvasWidth = 1592;
        canvasHeight = 900;
    }


    // Convertir Uint8Array a Buffer
    const buffer = Buffer.from(screenshotBuffer);

    // Crear un canvas
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    let screenshotImage;

    try {
        // Cargar la imagen usando el buffer convertido
        screenshotImage = await loadImage(buffer);
    } catch (error) {
        console.error('Error al cargar la imagen de captura de pantalla:', error);
        throw new Error('Error al procesar la imagen de captura de pantalla.');
    }

    // Proceder a dibujar en el canvas

    if (device !== 'celular'){
        ctx.drawImage(screenshotImage, 0, 89);

    }
    else{
        ctx.drawImage(screenshotImage, 0, 21);
    }

    let barImage;
    // Cargar bar.png en la parte superior

    if (device !== 'celular'){
        barImage = await loadImage('./public/images/banners/bar.png');

    }
    else{
        console.log("banner celular");

        barImage = await loadImage('./public/images/banners/banner_mobile.png');
    }


   

    ctx.drawImage(barImage, 0, 0);

    if(banner1Url){
        // Cargar banner1 y banner lateral desde las URLs
        const banner1Image = await loadImage(banner1Url); // Una URL pública

        if (device !== 'celular'){
            ctx.drawImage(banner1Image, (canvasWidth - banner1Image.width) / 2, banner1Image.height <= 100 ? 340 : 270); // Centrado
    
        }
        else{
            ctx.drawImage(banner1Image, (canvasWidth - banner1Image.width) / 2, canvasHeight - 100); 
        }
    

    }

    if(bannerLateralUrl && device !== 'celular'){
        const bannerLateralImage = await loadImage(bannerLateralUrl); // Otra URL pública
        ctx.drawImage(bannerLateralImage, canvasWidth - bannerLateralImage.width - 200, 550); // Ajustar posición
    }

    // Formatear la fecha y dibujarla
    const formattedDate = formatDateFromHrefDateTopright(href);
    if(device === 'celular'){
        ctx.font = 'bold 14px "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = 'white';
        ctx.fillText(formattedDate, canvasWidth - 90 , 16);

        const x = await loadImage('./public/images/banners/x.jpg'); // Otra URL pública
        ctx.drawImage(x, canvasWidth - 30, canvasHeight - 132); // Ajustar posición
    }
    else{
        ctx.font = 'bold 14px "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = 'white';
        ctx.fillText(formattedDate, canvasWidth - 13 - ctx.measureText(formattedDate).width, 16);

    }


    // Texto de la URL
    const urltext = href;
    ctx.font = "bold 13px 'San Francisco'";
    ctx.fillStyle = "#333333";
    ctx.textBaseline = "middle";

    if(device !== 'celular'){
        const textWidth = ctx.measureText(urltext).width;
        let displayText = urltext;
    
        if (textWidth > 582) {
            const ellipsis = "  ...";
            let truncatedText = urltext;
    
            while (ctx.measureText(truncatedText + ellipsis).width > 582 && truncatedText.length > 0) {
                truncatedText = truncatedText.slice(0, -1);
            }
    
            displayText = truncatedText + ellipsis;
        }
    
        ctx.fillText(displayText, 155, 70);
    }


    return canvas.toBuffer('image/png');
}

// Endpoint principal
app.get('/', async (req, res) => {
    try {
        if(!auth){
            auth = await authorize();
        }
        const parentID = idCarpetaRaiz; // ID de la carpeta raiz
        const folders = await listFolders(auth, parentID); // Obtener carpetas de la carpeta por defecto

        res.render('index', {
            folders,
            currentFolderId: parentID,
            currentFolderName: "Carpeta Raíz",
            message: req.query.message
        });
    } catch (error) {
        console.error('Error listing folders:', error);
        res.status(500).send('Error al cargar las carpetas desde Drive');
    }
});
function formatDateFromHrefDateTopright(href) {
    const match = href.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//); // Extraer fecha del href
    if (match) {
        const year = match[1];
        const month = parseInt(match[2], 10); // Mes entre 1-12
        const day = match[3];
        const months = ["ene", "feb", "mar", "abr", "may", "jun",
                        "jul", "ago", "sep", "oct", "nov", "dic"];
        return `${day} ${months[month - 1]}. ${year}`; // Formato "11 jun. 2024"
    }
    return '';
}

app.get('/folders/:id', async (req, res) => {
    const folderId = req.params.id;
    try {
        const subFolders = await listFolders(auth, folderId);
        res.json(subFolders);
    } catch (error) {
        console.error('Error fetching subfolders:', error);
        res.status(500).send('Error al cargar subcarpetas');
    }
});

// Endpoint para subir archivos y procesar JSON
app.post('/upload', upload.fields([{ name: 'banner1' }, { name: 'banner_lateral' }]), async (req, res) => {
    console.log("/upload");
    try {
        const folderId = req.body.folderId; // ID de la carpeta de destino
        const folderName = req.body.folderName; // Nombre de la carpeta
        const dateRange = req.body.daterange; // Rango de fechas
        const device = req.body.device; // Rango de fechas
        let isPastDays = isDateRangeBeforeToday(dateRange);

        const dates = dateRange.split(' - ');
        const startDate = momentArgentina(dates[0], 'MM/DD/YYYY');
        const endDate = momentArgentina(dates[1], 'MM/DD/YYYY');

        let successMessage = `Los archivos se han subido correctamente a la carpeta: ${folderName}`;
        let banner1Id = null;
        let bannerLateralId = null;

        // Cargar archivos imagenes
        if (req.files['banner1']) {
            const timestamp = Date.now();
            const fileBuffer = req.files['banner1'][0].buffer;
            const fileName = `banner1_${timestamp}.jpg`; //carpeta de los banners
            banner1Id = await uploadBufferToDrive(auth, idCarpetaBanners, fileName, fileBuffer, 'image/jpeg');
        }
        console.log("banner1");


        if (req.files['banner_lateral']) {
            const timestamp = Date.now();
            const fileBuffer = req.files['banner_lateral'][0].buffer;
            const fileName = `banner_lateral_${timestamp}.jpg`;//carpeta de los banners
            bannerLateralId = await uploadBufferToDrive(auth, idCarpetaBanners, fileName, fileBuffer, 'image/jpeg');
        }
        console.log("banner_latera");

        const jsonMimeType = 'application/json';
        const jsonFolderId = idCarpetaJsones; // ID de la carpeta específica donde se guardarán los JSON

            // Procesar cada fecha en el rango
            for (let date = startDate.clone(); date.isSameOrBefore(endDate); date.add(1, 'days')) {
                const currentDate = date.format('MM-DD-YYYY');

                const jsonFileName = `${currentDate}.json`; // Nombre del archivo JSON para esa fecha
                let jsonData = [];

                // Crear una instancia de Google Drive
                const drive = google.drive({ version: 'v3', auth });

                // Intentar obtener el JSON existente
                let idJson;
                try {
                    const existingJsonResponse = await drive.files.list({
                        q: `name='${jsonFileName}' and '${jsonFolderId}' in parents and trashed=false`,
                        fields: 'files(id, name)',
                    });

                    if (existingJsonResponse.data.files.length > 0) {
                        const fileId = existingJsonResponse.data.files[0].id;

                        // Descargar el JSON existente
                        const existingFile = await drive.files.get({
                            fileId: fileId,
                            alt: 'media',
                        }, { responseType: 'arraybuffer' });
                        idJson = existingJsonResponse.data.files[0].id;
                        // Convertir el buffer en un JSON
                        const existingJson = JSON.parse(Buffer.from(existingFile.data).toString('utf-8'));
                        jsonData = existingJson; // Asignar los datos existentes
                    }
                } catch (error) {
                    console.error('Error fetching existing JSON:', error);
                }

                // Crear el objeto que se va a añadir
                const dateObject = {
                    id: Date.now().toString(), // Genera un ID usando el timestamp
                    fecha: currentDate,
                    hora: momentArgentina().format('HH:mm:ss'),
                    banner: banner1Id ? `https://drive.google.com/thumbnail?id=${banner1Id}&sz=w1000` : null,
                    banner_lateral: bannerLateralId ? `https://drive.google.com/thumbnail?id=${bannerLateralId}&sz=w1000` : null,
                    folder: folderId, // Agregar el ID de la carpeta
                    folder_name: folderName,
                    device: device
                };

                // Agregar el nuevo objeto a los datos existentes
                if(req.files['banner1'] || req.files['banner_lateral']){
                    jsonData.push(dateObject);
                // Convertir el array de objetos JSON a un buffer
                const jsonBuffer = Buffer.from(JSON.stringify(jsonData, null, 2));

                // Subir el archivo JSON a Google Drive
                await uploadFileToDrive(auth, jsonFolderId, jsonFileName, jsonBuffer, jsonMimeType);

                }
         

            }
        
            console.log("temrina de crear los jsones")


        try {
            console.log(dateRange, "dateRange",  "es antes de hoy", isPastDays);
            if(isPastDays){
               await axios.get(`http://localhost:3000/take-screenshot?range=${dateRange}`);
            }
        }
        catch (e){
            console.log("error", e);
            
        }


        res.redirect('/?no_cargar_jsones_fechas=true&message=' + (!isPastDays ? encodeURIComponent(successMessage): "se crearon los json de fechas pasadas, se crearán las imagenes en breve"));
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).send('Error al cargar el archivo en Google Drive');
    }
});


// Endpoint para obtener JSON por rango de fechas
app.post('/json-by-dates', async (req, res) => {
    console.log("/json-by-dates");
    try {
        const dateRange = req.body.dateRange; // Obtenemos el rango de fechas

        // Validar que dateRange esté definido
        if (!dateRange) {
            return res.status(400).json({ error: 'El rango de fechas es requerido' });
        }

        // Crea una instancia de Google Drive
        const drive = google.drive({ version: 'v3', auth });

        const dates = dateRange.split(' - ');
        const startDate = momentArgentina(dates[0], 'MM/DD/YYYY');
        const endDate = momentArgentina(dates[1], 'MM/DD/YYYY');
        const jsonFolderId = idCarpetaJsones; // ID de la carpeta donde se guardan los JSON

        let jsonResults = [];
        await waitFor(5000);
        // Procesar cada fecha en el rango
        for (let date = startDate.clone(); date.isSameOrBefore(endDate); date.add(1, 'days')) {
            console.log(date);
            await waitFor(2000);

            const currentDate = date.format('MM-DD-YYYY');
            const jsonFileName = `${currentDate}.json`;

            // Intentar obtener el JSON para esa fecha
            const existingJsonResponse = await drive.files.list({
                q: `name='${jsonFileName}' and '${jsonFolderId}' in parents and trashed=false`,
                fields: 'files(id)',
            });


            if (existingJsonResponse.data.files.length > 0) {
                const fileId = existingJsonResponse.data.files[0].id;

                // Descargar el JSON existente
                const existingFile = await drive.files.get({
                    fileId: fileId,
                    alt: 'media',
                }, { responseType: 'arraybuffer' });
                // Convertir el buffer en un JSON y agregarlo a los resultados
                const jsonData = JSON.parse(Buffer.from(existingFile.data).toString('utf-8'));
                jsonResults.push(...jsonData); // Aquí agregamos los datos al array
            }
            else{
                console.log("no existe ",currentDate)
            }
        }
        console.log("json-by-dates",jsonResults);
        res.json(jsonResults);
    } catch (error) {
        console.error('Error fetching JSONs by dates:', error);
        res.status(500).json({ error: 'Error al cargar los archivos JSON.' });
    }
});

// Endpoint para eliminar un ítem del JSON
app.post('/delete-json-item', async (req, res) => {
    try {
        const { fecha, itemId } = req.body; // Obtener fecha e ID del ítem
        const jsonFolderId = idCarpetaJsones; // ID de la carpeta donde se guardan los JSON
        const jsonFileName = `${fecha}.json`; // Nombre del archivo JSON para esa fecha

        const drive = google.drive({ version: 'v3', auth });

        // Intentar obtener el JSON para esa fecha
        const existingJsonResponse = await drive.files.list({
            q: `name='${jsonFileName}' and '${jsonFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
        });

        if (existingJsonResponse.data.files.length > 0) {
            const fileId = existingJsonResponse.data.files[0].id;

            // Descargar el JSON existente
            const existingFile = await drive.files.get({
                fileId: fileId,
                alt: 'media',
            }, { responseType: 'arraybuffer' });

            // Convertir el buffer en un JSON
            const jsonData = JSON.parse(Buffer.from(existingFile.data).toString('utf-8'));

            // Filtrar el ítem que se desea eliminar
            const updatedData = jsonData.filter(item => item.id !== itemId); // Filtra el ítem por ID

            // Convertir el array actualizado a un buffer
            const jsonBuffer = Buffer.from(JSON.stringify(updatedData, null, 2));

            // Subir el archivo JSON actualizado a Google Drive
            await drive.files.update({
                fileId: fileId,
                media: {
                    mimeType: 'application/json',
                    body: streamifier.createReadStream(jsonBuffer),
                },
            });

            res.json({ message: 'Ítem eliminado correctamente' });
        } else {
            res.status(404).json({ error: 'No se encontró el archivo para eliminar el ítem' });
        }
    } catch (error) {
        console.error('Error deleting JSON item:', error);
        res.status(500).json({ error: 'Error al eliminar el ítem del JSON' });
    }
});

// Nuevo endpoint para capturar pantallas
app.post('/screenshot', async (req, res) => {
    console.log("/screenshot");
    try {
        const { folderId, banner1, banner_costado, datePast ,device} = req.body; // Obtener el ID de la carpeta, banner1 y banner_costado
        console.log("datePast",datePast);
        await captureScreenshotAndUpload(folderId, auth, banner1, banner_costado, datePast, device); // Pasa banner1 y banner_costado a la función
        res.status(200).json({ message: 'Captura de pantalla realizada con éxito.' });
    } catch (error) {
        console.error('Error tomando la captura de pantalla:', error);
        res.status(500).json({ error: 'Error al tomar la captura de pantalla.' });
    }
});

app.get('/start', async (req, res) => {
    console.log("start",momentArgentina().format('YYYY-MM-DD HH:mm:ss'));
    res.send('iniciado');
});

function obtenerFechaActual() {
    const fechaFormateada = momentArgentina(new Date()).format('MM/DD/YYYY')
    return `${fechaFormateada} - ${fechaFormateada}`;
}

function isDateRangeBeforeToday(dateRangeString) {
    // Dividir el string para obtener las fechas inicial y final
    const dates = dateRangeString.split(" - ");

    // Crear objetos moment para las fechas inicial y final
    const startDate = momentArgentina(dates[0], 'MM/DD/YYYY'); // La fecha de inicio
    const endDate = momentArgentina(dates[1], 'MM/DD/YYYY');   // La fecha de fin
    const today = momentArgentina(); // La fecha actual

    // Verificar si ambas fechas son anteriores a hoy
    return startDate.isBefore(today, 'day') || endDate.isBefore(today, 'day');
}
function esFechaHoyOPosterior(fechaStr) {
    // Convertir la cadena de fecha al formato deseado
    const fecha = momentArgentina(fechaStr, "MM-DD-YYYY");
    // Obtener la fecha actual
    const hoy = momentArgentina();

    // Comparar las fechas
    return fecha.isSameOrAfter(hoy, 'day');
}

app.get('/take-screenshot', async (req, res) => {
    console.log("/take-screenshot'");
    try {
        if(!auth){
            auth = await authorize(); // Reautenticarse si es necesario
        }
        
        const { range } = req.query;  //verificar fechas pasadas
        console.log("rang",range);
        if(range){
            console.log(isDateRangeBeforeToday(range));
        }
        console.log("json-by-dates");
        const response = await axios.post('http://localhost:3000/json-by-dates', {
            dateRange: range && isDateRangeBeforeToday(range) ? range : obtenerFechaActual() 
        });

        /*const resultadosUnicos = [];
        const set = new Set(); // Crear un Set para los identificadores únicos
        
        response.data.forEach(current => {
            // Crear un identificador único basado en las claves especificadas
            const identifier = `${current.fecha}|${current.folder}|${current.folder_name}|${current.device}`;
        
            // Verificamos si el identificador ya está en el Set
            if (!set.has(identifier)) {
                set.add(identifier); // Agregar identificador al Set
                resultadosUnicos.push(current); // Agregar el objeto actual a los resultados únicos
            }
        });
        const resultados = resultadosUnicos;*/
        const resultados = response.data;

        console.log(resultados.length);

        let contador= 0;
        for (let date of resultados) {
            contador ++;
            if(range){
                console.log("-------------",range, "---------");
            }
            else{
                console.log("-------------",obtenerFechaActual(), "---------");
            }
            if(resultados && resultados.length){
                console.log(contador," de ", resultados.length);
            }

            console.log(date);
            if(range && !esFechaHoyOPosterior(date.fecha) || !range){

                let object = {
                    folderId: date.folder,
                    banner1: date.banner,
                    banner_costado: date.banner_lateral,
                    device: date.device
                }
                if(range){
                    object.datePast=date.fecha;
                }
                if(object.banner1 || object.banner_costado){
                    console.log("http://localhost:3000/screenshot");
                    const screen = await axios.post('http://localhost:3000/screenshot', object);
                    console.log(screen.data);
                }
                

            }
        }
        if(!range && resultados.length === 0){
            await axios.post('http://localhost:3000/screenshot', {})
        }
        res.status(200).json({ message: 'Proceso completado', resultados: resultados });
    } catch (error) {
        res.status(500).json({ message: 'Error en el proceso', error: error.message });
    }
});

// Inicia el servidor
app.listen(port, () => {
    console.log(`El servidor está corriendo en http://localhost:${port}`);
});
