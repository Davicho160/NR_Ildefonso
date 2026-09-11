require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

const requiredEnvironment = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvironment = requiredEnvironment.filter(name => !process.env[name]);

if (missingEnvironment.length) {
    console.error(`Faltan variables de entorno obligatorias: ${missingEnvironment.join(', ')}`);
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

db.connect(err => { 
    if (err) {
        console.error("ERROR DE CONEXIÓN DB:", err.message);
        process.exit(1);
    } else {
        console.log("Conectado a db_juguetes perfectamente");
    }
});

app.get('/usuarios', (req, res) => {
    db.query('SELECT * FROM cat_usuarios', (err, result) => {
        if (err) res.status(500).json({ error: "Error consultando usuarios" });
        else res.json(result);
    });
});

app.post('/usuarios', (req, res) => {
    const { usuario } = req.body;
    db.query('INSERT INTO cat_usuarios (usuario) VALUES (?)', [usuario], (err) => {
        if (err) {
            console.error("Error agregando usuario:", err.message);
            res.status(500).json({ error: "Error agregando usuario" });
        }
        else res.json({ message: "Usuario agregado" });
    });
});

app.get('/movimientos', (req, res) => {
    const { fechaInicio, fechaFin, usuario, tipoMovimiento } = req.query;
    let sql = "SELECT * FROM tb_movimientos WHERE 1=1";
    const params = [];

    if (fechaInicio && fechaFin) {
        sql += " AND fecha_moviemiento BETWEEN ? AND ?";
        params.push(fechaInicio, fechaFin);
    } else if (fechaInicio) {
        sql += " AND fecha_moviemiento >= ?";
        params.push(fechaInicio);
    } else if (fechaFin) {
        sql += " AND fecha_moviemiento <= ?";
        params.push(fechaFin);
    }

    if (usuario) {
        sql += " AND usuario = ?";
        params.push(usuario);
    }

    if (tipoMovimiento) {
        sql += " AND tipo_movimiento = ?";
        params.push(tipoMovimiento);
    }

    sql += " ORDER BY fecha_moviemiento DESC, id_movimiento DESC";

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error("Error consultando movimientos:", err.message);
            res.status(500).json({ error: "Error consultando movimientos" });
        }
        else res.json(result);
    });
});

app.post('/movimientos/dividido', (req, res) => {
    const { fecha_moviemiento, tipo_movimiento, detalle_movimiento, movimiento, gastoPlaza, gastoGasolina, usuarios } = req.body;
    const total = Number(movimiento);
    const plaza = Number(gastoPlaza);
    const gasolina = Number(gastoGasolina);
    const usuariosUnicos = [...new Set(Array.isArray(usuarios) ? usuarios.filter(Boolean) : [])];

    if (!fecha_moviemiento || !tipo_movimiento || !Number.isFinite(plaza) || !Number.isFinite(gasolina) || plaza < 0 || gasolina < 0 || !Number.isFinite(total) || total <= 0 || Math.abs(total - (plaza + gasolina)) > 0.01 || !usuariosUnicos.length) {
        return res.status(400).json({ error: "Gasto plaza, gasolina, fecha, tipo y al menos un usuario son obligatorios" });
    }

    const totalCentavos = Math.round(total * 100);
    const parteBase = Math.floor(totalCentavos / usuariosUnicos.length);
    const sobrantes = totalCentavos % usuariosUnicos.length;
    const plazaPorPersona = plaza / usuariosUnicos.length;
    const gasolinaPorPersona = gasolina / usuariosUnicos.length;
    const detalle = detalle_movimiento || `Total plaza: $${plaza.toFixed(2)} | Total gasolina: $${gasolina.toFixed(2)} | Plaza por persona: $${plazaPorPersona.toFixed(2)} | Gasolina por persona: $${gasolinaPorPersona.toFixed(2)}`;
    const sql = `INSERT INTO tb_movimientos
        (usuario, movimiento, fecha_moviemiento, tipo_movimiento, detalle_movimiento)
        VALUES (?, ?, ?, ?, ?)`;

    db.beginTransaction(err => {
        if (err) {
            console.error("Error iniciando transacción:", err.message);
            return res.status(500).json({ error: "No se pudo iniciar la transacción" });
        }

        const insertarSiguiente = indice => {
            if (indice >= usuariosUnicos.length) {
                return db.commit(commitError => {
                    if (commitError) {
                        console.error("Error confirmando movimiento:", commitError.message);
                        return db.rollback(() => res.status(500).json({ error: "No se pudo confirmar el movimiento" }));
                    }
                    res.json({ message: "Movimiento dividido registrado con éxito", registros: usuariosUnicos.length });
                });
            }

            const importeCentavos = parteBase + (indice < sobrantes ? 1 : 0);
            db.query(sql, [usuariosUnicos[indice], (importeCentavos / 100).toFixed(2), fecha_moviemiento, tipo_movimiento, detalle], queryError => {
                if (queryError) {
                    console.error("Error registrando movimiento dividido:", queryError.message);
                    return db.rollback(() => res.status(500).json({ error: "No se pudo registrar el movimiento dividido" }));
                }
                insertarSiguiente(indice + 1);
            });
        };

        insertarSiguiente(0);
    });
});

app.post('/movimientos', (req, res) => {
    const { usuario, movimiento, fecha_moviemiento, tipo_movimiento, detalle_movimiento } = req.body;

    if (!usuario || !movimiento || !fecha_moviemiento || !tipo_movimiento) {
        return res.status(400).json({ error: "Usuario, movimiento, fecha y tipo son obligatorios" });
    }

    const sql = `INSERT INTO tb_movimientos
        (usuario, movimiento, fecha_moviemiento, tipo_movimiento, detalle_movimiento)
        VALUES (?, ?, ?, ?, ?)`;

    db.query(sql, [usuario, movimiento, fecha_moviemiento, tipo_movimiento, detalle_movimiento || ''], (err, result) => {
        if (err) {
            console.error("Error registrando movimiento:", err.message);
            return res.status(500).json({ error: "Error registrando movimiento" });
        }
        res.json({ message: "Movimiento registrado con éxito", id_movimiento: result.insertId });
    });
});

app.get('/ventas', (req, res) => {
    const { fechaInicio, fechaFin, usuario } = req.query;
    let sql = "SELECT * FROM tb_juguetes_detalle WHERE 1=1";
    const params = [];

    if (fechaInicio && fechaFin) {
        sql += " AND fecha_venta BETWEEN ? AND ?";
        params.push(fechaInicio, fechaFin);
    } else if (fechaInicio) {
        sql += " AND fecha_venta >= ?";
        params.push(fechaInicio);
    } else if (fechaFin) {
        sql += " AND fecha_venta <= ?";
        params.push(fechaFin);
    }

    if (usuario) {
        sql += " AND usuario = ?";
        params.push(usuario);
    }
    
    sql += " ORDER BY fecha_venta,usuario DESC, id_tb_juguetes_detalle DESC";

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error("Error consultando ventas:", err.message);
            res.status(500).json({ error: "Error consultando ventas" });
        }
        else res.json(result);
    });
});

app.post('/ventas', async (req, res) => {
    const { nombre_juguete, descripcion, precio_compra, precio_venta, usuario, fecha_venta, dia } = req.body;
    
    // Lógica de prefijos
    const prefijosFijos = { 
        'David': 'DA', 
        'Daniel': 'D', 
        'Olan': 'O', 
        'Miguel': 'M', 
        'Madre': 'MA' 
    };
    
    const prefijo = prefijosFijos[usuario] || usuario.substring(0, 2).toUpperCase();

    // NUEVA LÓGICA: Buscamos el ID más alto extrayendo solo el número
    // Ejemplo: De 'MA52' extraemos el '52', buscamos el máximo y sumamos 1.
    const sqlGetMax = `
        SELECT MAX(CAST(SUBSTRING(jugueteID, ${prefijo.length + 1}) AS UNSIGNED)) as max_num 
        FROM tb_juguetes_detalle 
        WHERE jugueteID LIKE ?`;

    db.query(sqlGetMax, [prefijo + '%'], (err, results) => {
        if (err) {
            console.error("Error buscando ID máximo:", err.message);
            return res.status(500).json({ error: "Error buscando ID máximo" });
        }

        // Si no hay registros, empezamos en 1, si hay, sumamos 1 al máximo encontrado
        const ultimoNumero = results[0].max_num || 0;
        const nextId = prefijo + (ultimoNumero + 1);

        const sqlInsert = `INSERT INTO tb_juguetes_detalle 
            (jugueteID, nombre_juguete, descripcion, precio_compra, precio_sugerido, precio_venta, usuario, fecha_venta, dia, fecha_registro, estatus_venta) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), '2')`;

        db.query(sqlInsert, [nextId, nombre_juguete, descripcion, precio_compra, precio_venta, precio_venta, usuario, fecha_venta, dia], (err) => {
            if (err) {
                console.error("Error al insertar:", err.message);
                return res.status(500).json({ error: "Error en base de datos" });
            }
            res.json({ message: "Venta registrada con éxito", jugueteID: nextId });
        });
    });
});



app.listen(3001, () => console.log("Servidor corriendo en http://localhost:3001"));