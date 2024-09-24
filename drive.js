const axios = require('axios');
function obtenerFechaActual() {
    const fechaActual = new Date();

    // Obtener mes, día y año actuales
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0'); // Mes de 1 a 12
    const dia = String(fechaActual.getDate()).padStart(2, '0'); // Día de 1 a 31
    const año = fechaActual.getFullYear(); // Año

    // Formato MM/DD/YYYY
    const fechaFormateada = `${mes}/${dia}/${año}`;

    return `${fechaFormateada} - ${fechaFormateada}`;
}


(async()=>{
    const response = await axios.post('http://localhost:3000/json-by-dates', {
        dateRange: obtenerFechaActual()
    });
    console.log(response.data);
    for (let date of response.data){
        console.log(date);
        const screen = await axios.post('http://localhost:3000/screenshot', {
            folderId: date.folder,
            banner1:date.banner,
            banner_costado:date.banner_lateral
        });
        console.log(screen.data);

    }

})();
