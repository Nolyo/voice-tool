import re


def smart_format_text(text: str) -> str:
    """Applique un formatage simple mais utile au texte transcrit.

    - Trim des espaces en début/fin
    - Réduction des espaces multiples
    - Espaces autour de la ponctuation : supprime l'espace avant ,;:?! et force un espace après
    - Majuscule initiale
    - Point final si absence de ponctuation de fin
    """
    if not text:
        return text

    t = text.strip()

    # Réduire les espaces multiples
    t = re.sub(r"\s+", " ", t)

    # Supprimer espace avant la ponctuation et assurer espace après
    # , ; : ? !
    t = re.sub(r"\s+([,;:?!])", r"\1", t)  # supprime espace avant
    t = re.sub(r"([,;:?!])(\S)", r"\1 \2", t)  # ajoute espace après si manquant

    # Majuscule initiale si lettre
    if t and t[0].isalpha():
        t = t[0].upper() + t[1:]

    # Point final si pas de ponctuation de fin
    if t and t[-1] not in ".?!":
        t = t + "."

    return t


