const path = require('path');

module.exports = {
  entry: './src/index.ts',  // Punto de entrada de tu aplicación
  target: 'node',  // Especificamos que es para Node.js
  mode: 'production',  // Modo de producción para minificar y optimizar
  output: {
    filename: 'index.js',  // Nombre del archivo de salida
    path: path.resolve(__dirname, 'build'),  // Carpeta de salida
    libraryTarget: 'commonjs2',  // Esto es importante para Node.js
  },
  resolve: {
    extensions: ['.ts', '.js'],  // Extensiones a resolver
  },
  module: {
    rules: [
      {
        test: /\.ts$/,  // Todos los archivos .ts
        use: 'ts-loader',  // Usar ts-loader para compilar
        exclude: /node_modules/,  // Excluir node_modules
      },
    ],
  },
//   externals: {  // Esto evitará que Webpack empaquete tus dependencias en el bundle
//     express: 'commonjs express',  // Repite esta línea para todas tus dependencias
//   },
};
