window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const fxWebGlQuantumShaders = ns._fxWebGlQuantumShaders = ns._fxWebGlQuantumShaders || {};

    function createQuantumNodeShader(NOISE_GLSL) {
return {

                vertexShader: `${NOISE_GLSL}

                attribute float nodeSize;

                attribute float nodeType;

                attribute vec3 nodeColor;

                attribute float distanceFromRoot;

                uniform float uTime;

                uniform vec3 uPulsePositions[3];

                uniform float uPulseTimes[3];

                uniform float uPulseSpeed;

                uniform float uBaseNodeSize;

                varying vec3 vColor;

                varying float vNodeType;

                varying vec3 vPosition;

                varying float vPulseIntensity;

                varying float vDistanceFromRoot;

                varying float vGlow;

                float getPulseIntensity(vec3 worldPos, vec3 pulsePos, float pulseTime) {

                    if (pulseTime < 0.0) return 0.0;

                    float timeSinceClick = uTime - pulseTime;

                    if (timeSinceClick < 0.0 || timeSinceClick > 4.0) return 0.0;

                    float pulseRadius = timeSinceClick * uPulseSpeed;

                    float distToClick = distance(worldPos, pulsePos);

                    float pulseThickness = 3.0;

                    float waveProximity = abs(distToClick - pulseRadius);

                    return smoothstep(pulseThickness, 0.0, waveProximity) * smoothstep(4.0, 0.0, timeSinceClick);

                }

                void main() {

                    vNodeType = nodeType; vColor = nodeColor; vDistanceFromRoot = distanceFromRoot;

                    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;

                    vPosition = worldPos;

                    float totalPulseIntensity = 0.0;

                    for (int i = 0; i < 3; i++) { totalPulseIntensity += getPulseIntensity(worldPos, uPulsePositions[i], uPulseTimes[i]); }

                    vPulseIntensity = min(totalPulseIntensity, 1.0);

                    float breathe = sin(uTime * 0.7 + distanceFromRoot * 0.15) * 0.15 + 0.85;

                    float baseSize = nodeSize * breathe;

                    float pulseSize = baseSize * (1.0 + vPulseIntensity * 2.5);

                    vGlow = 0.5 + 0.5 * sin(uTime * 0.5 + distanceFromRoot * 0.2);

                    vec3 modPos = position;

                    if (nodeType > 0.5) { modPos += normal * snoise(position * 0.08 + uTime * 0.08) * 0.15; }

                    vec4 mvPos = modelViewMatrix * vec4(modPos, 1.0);

                    gl_PointSize = pulseSize * uBaseNodeSize * (1000.0 / -mvPos.z);

                    gl_Position = projectionMatrix * mvPos;

                }`,

                fragmentShader: `

                uniform float uTime; uniform vec3 uPulseColors[3];

                varying vec3 vColor; varying float vNodeType; varying vec3 vPosition;

                varying float vPulseIntensity; varying float vDistanceFromRoot; varying float vGlow;

                void main() {

                    vec2 center = 2.0 * gl_PointCoord - 1.0;

                    float dist = length(center);

                    if (dist > 1.0) discard;

                    float glowStrength = pow(1.0 - smoothstep(0.0, 0.5, dist), 1.2) + (1.0 - smoothstep(0.0, 1.0, dist)) * 0.3;

                    vec3 finalColor = vColor * (0.9 + 0.1 * sin(uTime * 0.6 + vDistanceFromRoot * 0.25));

                    if (vPulseIntensity > 0.0) {

                        finalColor = mix(finalColor, mix(vec3(1.0), uPulseColors[0], 0.4), vPulseIntensity * 0.8);

                        finalColor *= (1.0 + vPulseIntensity * 1.2);

                        glowStrength *= (1.0 + vPulseIntensity);

                    }

                    finalColor += vec3(1.0) * smoothstep(0.4, 0.0, dist) * 0.3;

                    float alpha = glowStrength * (0.95 - 0.3 * dist) * smoothstep(100.0, 15.0, length(vPosition - cameraPosition));

                    gl_FragColor = vec4(finalColor * (1.0 + vGlow * 0.1), alpha);

                }`

            }
    }

    function createQuantumConnectionShader(NOISE_GLSL) {
return {

                vertexShader: `${NOISE_GLSL}

                attribute vec3 startPoint; attribute vec3 endPoint; attribute float connectionStrength;

                attribute float pathIndex; attribute vec3 connectionColor;

                uniform float uTime; uniform vec3 uPulsePositions[3]; uniform float uPulseTimes[3]; uniform float uPulseSpeed;

                varying vec3 vColor; varying float vConnectionStrength; varying float vPulseIntensity;

                varying float vPathPosition; varying float vDistanceFromCamera;

                float getPulseIntensity(vec3 worldPos, vec3 pulsePos, float pulseTime) {

                    if (pulseTime < 0.0) return 0.0;

                    float timeSinceClick = uTime - pulseTime;

                    if (timeSinceClick < 0.0 || timeSinceClick > 4.0) return 0.0;

                    float pulseRadius = timeSinceClick * uPulseSpeed;

                    float distToClick = distance(worldPos, pulsePos);

                    float waveProximity = abs(distToClick - pulseRadius);

                    return smoothstep(3.0, 0.0, waveProximity) * smoothstep(4.0, 0.0, timeSinceClick);

                }

                void main() {

                    float t = position.x; vPathPosition = t;

                    vec3 mid = mix(startPoint, endPoint, 0.5);

                    vec3 perp = normalize(cross(normalize(endPoint - startPoint), vec3(0, 1, 0)));

                    if (length(perp) < 0.1) perp = vec3(1, 0, 0);

                    mid += perp * sin(t * 3.14) * 0.15;

                    vec3 p0 = mix(startPoint, mid, t), p1 = mix(mid, endPoint, t), finalPos = mix(p0, p1, t);

                    finalPos += perp * snoise(vec3(pathIndex * 0.08, t * 0.6, uTime * 0.15)) * 0.12;

                    vec3 worldPos = (modelMatrix * vec4(finalPos, 1.0)).xyz;

                    float totalPulseIntensity = 0.0;

                    for (int i = 0; i < 3; i++) { totalPulseIntensity += getPulseIntensity(worldPos, uPulsePositions[i], uPulseTimes[i]); }

                    vPulseIntensity = min(totalPulseIntensity, 1.0);

                    vColor = connectionColor; vConnectionStrength = connectionStrength;

                    vDistanceFromCamera = length(worldPos - cameraPosition);

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);

                }`,

                fragmentShader: `

                uniform float uTime; uniform vec3 uPulseColors[3];

                varying vec3 vColor; varying float vConnectionStrength; varying float vPulseIntensity;

                varying float vPathPosition; varying float vDistanceFromCamera;

                void main() {

                    float combinedFlow = (sin(vPathPosition * 25.0 - uTime * 4.0) * 0.5 + 0.5 + (sin(vPathPosition * 15.0 - uTime * 2.5 + 1.57) * 0.5 + 0.5) * 0.5) / 1.5;

                    vec3 baseColor = vColor * (0.8 + 0.2 * sin(uTime * 0.6 + vPathPosition * 12.0));

                    float flowIntensity = 0.4 * combinedFlow * vConnectionStrength;

                    vec3 finalColor = baseColor;

                    if (vPulseIntensity > 0.0) {

                        finalColor = mix(baseColor, mix(vec3(1.0), uPulseColors[0], 0.3) * 1.2, vPulseIntensity * 0.7);

                        flowIntensity += vPulseIntensity * 0.8;

                    }

                    finalColor *= (0.7 + flowIntensity + vConnectionStrength * 0.5);

                    float alpha = (0.7 * vConnectionStrength + combinedFlow * 0.3);

                    alpha = mix(alpha, min(1.0, alpha * 2.5), vPulseIntensity);

                    gl_FragColor = vec4(finalColor, alpha * smoothstep(100.0, 15.0, vDistanceFromCamera));

                }`

            }
    }

    Object.assign(fxWebGlQuantumShaders, {
        createQuantumNodeShader,
        createQuantumConnectionShader
    });
})(window.EveConstellationMap);
