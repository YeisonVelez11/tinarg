const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

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
            await waitFor(60000);

            await page.setViewport({ width: 1533, height: 900 });

            const screenshotPath = path.join(__dirname, 'screenshot', 'screenshot.png');
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
        const canvasWidth = 1533;
        const canvasHeight = 900;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Cargar la imagen del screenshot
        const screenshotImage = await loadImage(screenshotPath);

        // Mostrar la captura de pantalla (sin desplazamiento)
        ctx.drawImage(screenshotImage, 0, 0);

        // Cargar bar.png en la parte superior
        const barImage = await loadImage('./images/banners/bar.png');
        ctx.drawImage(barImage, 0, 0); // Colocar bar.png en la parte superior

        // Cargar banner1.png centrada a 250px desde arriba
        const banner1Image = await loadImage('./images/banners/banner1.png');
        ctx.drawImage(banner1Image, (canvasWidth - banner1Image.width) / 2, 250); // Centered

        // Cargar banner_lateral.png a la nueva posición
        const bannerLateralImage = await loadImage('./images/banners/banner_lateral.png');
        ctx.drawImage(bannerLateralImage, canvasWidth - bannerLateralImage.width - 200, 410); // Ajustar posición

        // Formatear la fecha y dibujarla
        const formattedDate = formatDateFromHref(href);
        ctx.font = '12px "Helvetica Neue", Arial, sans-serif'; // Ajustar fuente
        ctx.fillStyle = 'white'; // Color blanco para el texto
        ctx.fillText(formattedDate, canvasWidth - 10 - ctx.measureText(formattedDate).width, 13); // 10px desde la derecha y 3px desde arriba

        // Guardar la imagen final
        const finalImagePath = path.join(__dirname, 'screenshot', 'final_screenshot.png');
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(finalImagePath, buffer);
        console.log(`Imagen final guardada en ${finalImagePath}`);
    }

    await captureScreenshot();
})();
