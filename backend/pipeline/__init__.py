"""Pipeline foto -> color-by-number SVG.

Etapas (ver plan):
  1. preprocess  -> redimensionar + suavizado preservando bordes
  2. quantize    -> k-means en LAB hacia una paleta pequena
  3. segment     -> etiquetado + fusion de regiones pequenas (paso clave)
  4. vectorize   -> contornos -> paths SVG suaves
  5. labels      -> polylabel -> posicion del numero
  6. serialize   -> ensambla el JSON de salida
"""

from .runner import generate_color_by_number

__all__ = ["generate_color_by_number"]
