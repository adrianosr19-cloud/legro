# LEGRO — direção de jogabilidade

O produto passa a ser tratado como jogo infantil de construção. Não há camada de análise psicológica, filosófica ou de perfil da criança.

## Implementado nesta revisão
- Área-base ampliada de 8×8 para 12×12 studs.
- Mesa visual ampliada e câmera recuada para a criança enxergar melhor a construção.
- A antiga lista vertical de peças foi substituída por uma **Caixa de peças** próxima da área de jogo.
- A caixa abre sob demanda e mostra uma peça grande por vez, com desenho, nome, cor e quantidade.
- Setas grandes esquerda/direita percorrem as peças; tocar na peça a pega.
- Controles da peça ficam sobre a área de jogo somente quando há uma peça na mão.
- Ações principais foram simplificadas para `Encaixar` e `Guardar`.

## Próxima mudança estrutural necessária
A lei atual representa orientação somente por `yaw` em quatro estados (0°, 90°, 180°, 270° em torno do eixo vertical). Portanto, colocar uma peça em pé, deitada de lado ou em ângulo livre não é apenas uma alteração visual: exige ampliar a representação de pose, rotação de células, sockets, colisão, encaixe e testes. Não deve ser falsificado apenas no render, pois a peça pareceria estar numa posição enquanto a lei calcularia outra.

A próxima revisão deve introduzir orientação 3D coerente na lei antes de liberar esses controles na interface.

## Revisão de manipulação 3D

A interface agora permite virar a peça na mão para frente e para o lado, além do giro horizontal. Essa manipulação é visual e deliberadamente não pode ser confirmada enquanto a orientação não corresponder à lei física atual. Isso evita o erro de gravar uma pose horizontal enquanto a criança vê uma peça inclinada. A próxima camada estrutural deverá migrar colisão e sockets para coordenadas físicas 3D antes de permitir encaixe lateral/vertical definitivo.


<!-- Preview Vercel: branch de desenvolvimento conectada para testes visuais. -->
