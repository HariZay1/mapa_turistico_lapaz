import os
from qgis.core import (
    QgsProject, QgsVectorLayer, QgsCoordinateReferenceSystem, QgsRectangle,
    QgsDataSourceUri
)

class SimplifiedTourismMap:
    def __init__(self):
        self.project = QgsProject.instance()

    def setup_project(self):
        self.project.setCrs(QgsCoordinateReferenceSystem('EPSG:4326'))
        self.project.setTitle("Mapa Turístico Simplificado de La Paz")

    def load_tourism_layer(self):
        uri = QgsDataSourceUri()
        uri.setConnection(
            "localhost", 
            "5432",
            "mapa_turistico_lapaz",
            "postgres",
            "ari_2025"
        )
        uri.setDataSource("public", "lugares_turisticos", "coordenadas")
        layer = QgsVectorLayer(uri.uri(), "Lugares Turísticos La Paz", "postgres")
        if layer.isValid():
            self.project.addMapLayer(layer)
            return layer
        return None

    def zoom_to_la_paz(self):
        try:
            from qgis.utils import iface
            canvas = iface.mapCanvas()
            la_paz_extent = QgsRectangle(-68.25, -16.65, -68.00, -16.35)
            canvas.setExtent(la_paz_extent)
            canvas.refresh()
        except:
            pass

    def run(self):
        self.setup_project()
        tourism_layer = self.load_tourism_layer()
        if tourism_layer:
            self.zoom_to_la_paz()

if __name__ == "__console__":
    map = SimplifiedTourismMap()
    map.run()