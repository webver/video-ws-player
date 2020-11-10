const path = require('path')

module.exports = {
    css: {
        loaderOptions: {
            stylus: {
                loader: 'stylus-resources-loader',
                // import: [path.resolve(__dirname, 'src/styles/imports.styl')]
            }
        }
    },
    devServer: { port: 38082 }
};