const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const express = require('express');
const multer = require('multer');
const app = express();
const port = 3000;


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
        const year = match[1];
        const month = parseInt(match[2], 10); // Mes entre 1-12
        const day = match[3];
        const months = ["ene", "feb", "mar", "abr", "may", "jun",
                        "jul", "ago", "sep", "oct", "nov", "dic"];
        return `${day} ${months[month - 1]}. ${year}`; // Formato "11 jun. 2024"
    }
    return '';
}

(async () => {
    const browser = await puppeteer.launch({ headless: false });

    async function waitFor(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function captureScreenshot() {
        const page = await browser.newPage();
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        try {
            await page.goto('https://revistaforum.com.br/', { waitUntil: 'load', timeout: 60000 });
        } catch (error) {
            console.error("Error al cargar la página:", error);
            await page.close();
            return;
        }

        const currentHref = await page.evaluate(() => {
            const element = document.querySelector('.z-foto a');
            return element ? element.href : null;
        });

        const previousHref = await getPreviousHref();

        console.log(`Current Href: ${currentHref}`);
        console.log(`Previous Href: ${previousHref}`);

        if (currentHref !== previousHref) {
            await saveCurrentHref(currentHref);

            // Navegar directamente al href actual
            try {
                await page.goto(currentHref, { waitUntil: 'load', timeout: 60000 });
            } catch (error) {
                console.error("Error al navegar al nuevo href:", error);
                await page.close();
                return;
            }

            // Esperar 60 segundos antes de tomar la captura
            await page.setViewport({ width: 1592, height: 900 });

            await waitFor(60000);
            try {
                await page.evaluate(() => {

                    const adds= document.querySelectorAll(".content-banner.hidden-m");
                    console.log(adds.length);
                    if(adds && adds[0]){
                        adds[0].style.opacity= 0;
                        adds[0].style.height= "150px";
                    }
                    else if(adds && adds[1]){
                        adds[1].style.opacity = 0;
                    }
                    else if(adds && adds[2]){
                        adds[2].style.opacity = 0;
                    }
                    else if(adds && adds[3]){
                        adds[3].style.opacity = 0;
                    }
                    else {
                        const header = document.querySelector(".main-article--header");
                        if(header){
                            header.style["margin-top"] = "150px";
                        }
                    }

                });
            }
            catch (error){
                console.log("problem adds");
            }

            const screenshotPath = path.join(__dirname,"public",'screenshot', 'screenshot.png');
            await page.screenshot({ path: screenshotPath });
            console.log("Captura de pantalla tomada.");

            // Procesar la imagen final
            await processImage(screenshotPath, currentHref);
            await page.close();
        } else {
            await page.close();
        }

        // Cerrar el navegador al final del proceso
        await browser.close();
    }

    async function processImage(screenshotPath, href) {
        const canvasWidth = 1592;
        const canvasHeight = 900;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Cargar la imagen del screenshot
        const screenshotImage = await loadImage(screenshotPath);

        // Mostrar la captura de pantalla (sin desplazamiento)
        ctx.drawImage(screenshotImage, 0, 89);
        // Cargar bar.png en la parte superior
        const barImage = await loadImage('./public/images/banners/bar.png');
        ctx.drawImage(barImage, 0, 0); // Colocar bar.png en la parte superior

        // Cargar banner1.png centrada a 250px desde arriba
        const banner1Image = await loadImage('./public/images/banners/banner1.png');
        ctx.drawImage(banner1Image, (canvasWidth - banner1Image.width) / 2, 270); // Centered

        // Cargar banner_lateral.png a la nueva posición
        const bannerLateralImage = await loadImage('./public/images/banners/banner_lateral.png');
        ctx.drawImage(bannerLateralImage, canvasWidth - bannerLateralImage.width - 200, 450); // Ajustar posición

        // Formatear la fecha y dibujarla
        const formattedDate = formatDateFromHref(href);
        ctx.font = 'bold 14px "Helvetica Neue", Arial, sans-serif'; // Ajustar fuente
        ctx.fillStyle = 'white'; // Color blanco para el texto
        ctx.fillText(formattedDate, canvasWidth - 13 - ctx.measureText(formattedDate).width, 16); // 10px desde la derecha y 3px desde arriba

        //texto url
        const urltext = href; // Texto a mostrar
        ctx.font = "bold 13px 'San Francisco'"; // Usa la fuente registrada
        ctx.fillStyle = "#333333"; // Color del texto
        ctx.textBaseline = "middle"; // Alineación vertical del texto

        // Comprobar el ancho del urltext texto
        const textWidth = ctx.measureText(urltext).width;

        let displayText = urltext; // Texto a mostrar en el canvas

        if (textWidth > 582) {
            // Recorta el texto y agrega "..."
            const ellipsis = "  ...";
            let truncatedText = urltext;

            // Verifica el ancho del texto hasta donde encaja
            while (ctx.measureText(truncatedText + ellipsis).width > 582 && truncatedText.length > 0) {
                truncatedText = truncatedText.slice(0, -1); // Elimina el último carácter
            }

            displayText = truncatedText + ellipsis; // Texto final
        }

        // Dibuja el urltext texto recortado
        ctx.fillText(displayText, 155, 70); // Posición del urltext texto


        // Guardar la imagen final
        const finalImagePath = path.join(__dirname,"public",'screenshot', 'final_screenshot.png');
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(finalImagePath, buffer);
        console.log(`Imagen final guardada en ${finalImagePath}`);


    }

    await captureScreenshot();
})();




// Configuración de multer para almacenar archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images/banners'); // Guardamos las imágenes en esta carpeta
    },
    filename: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        if (file.fieldname === 'banner1') {
            cb(null, `banner1${fileExtension}`);
        } else if (file.fieldname === 'banner_lateral') {
            cb(null, `banner_lateral${fileExtension}`);
        } else {
            cb(new Error('Invalid field name.'));
        }
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Solo se permiten archivos de imagen (jpg, jpeg, png, gif)');
        }
    }
});

// Configura el motor de plantillas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Establecer la ruta a la carpeta de vistas
app.use(express.static('public')); // Sirve archivos estáticos desde la carpeta public

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index'); // Renderiza la vista index.ejs
});

// Maneja la carga de imágenes
app.post('/upload', upload.fields([{ name: 'banner1' }, { name: 'banner_lateral' }]), (req, res) => {
    res.redirect('/'); // Redirige a la raíz después de cargar
});

// Inicia el servidor
app.listen(port, () => {
    console.log(`El servidor está corriendo en http://localhost:${port}`);
});
