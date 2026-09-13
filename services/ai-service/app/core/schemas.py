"""Base Pydantic compartida: el backend Node envía/espera JSON en camelCase
(convención TS), mientras que el código Python interno usa snake_case (convención
PEP 8). `CamelModel` traduce automáticamente entre ambos en el límite HTTP para
que ningún router tenga que hacerlo a mano.
"""
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
