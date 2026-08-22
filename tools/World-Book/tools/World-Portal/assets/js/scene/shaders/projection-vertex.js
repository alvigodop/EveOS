export const PROJECTION_VERTEX_SHADER = `
  uniform float uProjectionBlend;
  uniform float uRadius;
  uniform float uFlatWidth;
  uniform float uFlatHeight;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vProjectionBlend;

  float easeProjection(float value) {
    return value * value * (3.0 - 2.0 * value);
  }

  void main() {
    vUv = uv;
    float blend = easeProjection(clamp(uProjectionBlend, 0.0, 1.0));
    vProjectionBlend = blend;

    float longitude = (uv.x - 0.5) * 6.28318530718;
    float latitude = (uv.y - 0.5) * 3.14159265359;
    float cosLatitude = cos(latitude);

    vec3 sphereNormal = normalize(vec3(
      sin(longitude) * cosLatitude,
      sin(latitude),
      cos(longitude) * cosLatitude
    ));
    vec3 spherePosition = sphereNormal * uRadius;
    vec3 flatPosition = vec3(
      (uv.x - 0.5) * uFlatWidth,
      (uv.y - 0.5) * uFlatHeight,
      0.0
    );

    vec3 transformedPosition = mix(spherePosition, flatPosition, blend);
    vec3 transformedNormal = normalize(mix(sphereNormal, vec3(0.0, 0.0, 1.0), blend));
    vec4 worldPosition = modelMatrix * vec4(transformedPosition, 1.0);

    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * transformedNormal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;
