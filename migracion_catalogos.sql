-- Migración: catálogos de usuarios y productos + relación con ventas
USE sistema_ventas;

-- Catálogo de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    activo TINYINT(1) NOT NULL DEFAULT 1
);

-- Catálogo de productos
CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255),
    precio_costo DECIMAL(10,2) DEFAULT 0,
    precio_venta DECIMAL(10,2) DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1
);

-- Semilla inicial de usuarios (ajusta/agrega los que necesites)
INSERT IGNORE INTO usuarios (nombre) VALUES
    ('Daniel'),
    ('Vendedor 2');

-- Agregar columnas de relación a ventas (si no existen)
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS producto_id INT NULL AFTER descripcion;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS usuario_id INT NULL AFTER usuario;

-- Llaves foráneas (se ejecutan solo la primera vez; si ya existen, se ignora el error)
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_producto FOREIGN KEY (producto_id) REFERENCES productos(id);
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
