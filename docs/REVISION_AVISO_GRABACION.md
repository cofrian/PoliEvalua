# Aviso de grabación — material para la revisión legal

Borrador técnico para el Servicio Jurídico y la Delegación de Protección de
Datos de la UPV. **No es un dictamen jurídico**: recoge qué hace la aplicación
de verdad y qué le falta al texto actual frente a la información que pide el
art. 13 del RGPD. Los puntos marcados «[UPV]» los tiene que completar la UPV.

## Qué hace la aplicación (comprobado en el código, 24/10/2026)

| Tema | Comportamiento |
|---|---|
| Activación | Por espacio, la activa la gestión (Admin → Grabaciones). Apagada por defecto. |
| Aviso | Cada miembro lo confirma antes de usar el espacio; si el texto cambia, se vuelve a pedir (versión del aviso). |
| Audio | Se sube en trozos, se transcribe (Groq; si falla, un transcriptor propio en Kaggle) y **se borra** al transcribirse, al fallar del todo o a las 3 h si la subida se abandona. |
| Encargados | Groq (Whisper) recibe el audio; si falla, Kaggle (Google) lo transcribe. NVIDIA recibe el texto para resumen e informe del jurado. Los tres, fuera de la UE. |
| Texto | Transcripción, resumen y materiales se guardan en Supabase. **No hay plazo de conservación**: duran lo que dure el espacio. |
| Quién lo ve | Solo las personas autorizadas del espacio (gestión y quien evalúa; la grabación puede ser privada de quien la hizo). |

## Texto actual

> Las exposiciones de este espacio se grabarán para transcribirlas
> automáticamente y preparar un resumen y materiales de apoyo para la
> evaluación. El audio no se guarda: se borra en cuanto se convierte en texto.
> Se conservan solo la transcripción y los materiales generados, que ven
> únicamente las personas autorizadas del espacio.

## Lo que le falta (art. 13 RGPD)

1. **Responsable del tratamiento** y sus datos de contacto. [UPV]
2. **Contacto de la Delegación de Protección de Datos.** [UPV]
3. **Base jurídica** (p. ej. misión de interés público docente, art. 6.1.e, o
   consentimiento, art. 6.1.a). Si es consentimiento, hace falta poder negarse
   sin perjuicio y una alternativa (exponer sin grabar). [UPV]
4. **Destinatarios y transferencias internacionales**: Groq, Kaggle/Google y NVIDIA (EE. UU.)
   y la garantía que se aplique (cláusulas tipo, Marco UE-EE. UU.). [UPV]
5. **Plazo de conservación** de transcripciones y materiales. Hoy no existe:
   propuesta técnica, borrarlos automáticamente N meses tras cerrar el espacio.
6. **Derechos** (acceso, rectificación, supresión, oposición, limitación) y cómo
   ejercerlos, más el derecho a reclamar ante la AEPD.
7. **Decisiones automatizadas**: aclarar que la IA no pone notas; solo prepara
   material de apoyo y la nota la decide una persona (art. 22).

## Propuesta de texto (para que la UPV la corrija)

> **Grabación de las exposiciones.** En este espacio las exposiciones se
> graban para transcribirlas y preparar un resumen y material de apoyo para
> quien evalúa. La nota la pone siempre una persona; la IA no califica.
>
> El audio no se guarda: se borra en cuanto se convierte en texto. La
> transcripción y los materiales los ven solo las personas autorizadas del
> espacio y se borran [plazo] después de cerrarlo.
>
> Para transcribir y resumir se usan servicios de Groq, Google (Kaggle) y NVIDIA, que pueden
> tratar los datos fuera de la UE con [garantía].
>
> Responsable: [UPV, dirección]. Delegación de Protección de Datos: [contacto].
> Base jurídica: [base]. Puedes ejercer tus derechos de acceso, rectificación,
> supresión, oposición y limitación en [canal], y reclamar ante la Agencia
> Española de Protección de Datos. [Si la base es el consentimiento: puedes
> pedir exponer sin grabación hablando con el profesorado.]

Notas técnicas: el texto se personaliza por espacio en Admin → Grabaciones, la
frase «El audio no se conserva…» se añade siempre, y cambiar el texto obliga a
todos a confirmarlo otra vez. Las traducciones están en `messages/*.json`
(`recordingNotice.default`).
