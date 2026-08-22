export const CLOUD_FRAGMENT_SHADER = `
  uniform sampler2D uCloudMap;
  uniform float uOpacity;
  uniform float uSoftness;
  uniform float uOffset;

  varying vec2 vUv;
  varying float vProjectionBlend;

  void main() {
    vec2 cloudUv = vec2(fract(vUv.x + uOffset), vUv.y);
    vec4 cloudSample = texture2D(uCloudMap, cloudUv);
    float threshold = mix(0.01, 0.13, clamp(uSoftness, 0.0, 1.0));
    float cloudAlpha = smoothstep(
      threshold,
      threshold + mix(0.20, 0.06, uSoftness),
      cloudSample.a
    );
    float flatRestraint = mix(1.0, 0.78, vProjectionBlend);
    gl_FragColor = vec4(
      vec3(0.96, 0.985, 1.0),
      cloudAlpha * uOpacity * flatRestraint
    );
  }
`;
