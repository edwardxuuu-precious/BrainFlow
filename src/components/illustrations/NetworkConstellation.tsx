import styles from './NetworkConstellation.module.css'

const points = [
  [84, 208],
  [132, 168],
  [166, 236],
  [214, 144],
  [238, 208],
  [292, 112],
  [334, 178],
  [376, 138],
  [404, 216],
  [458, 164],
  [512, 236],
  [558, 172],
  [606, 210],
  [648, 152],
  [686, 218],
] as const

const links = [
  [0, 1],
  [0, 2],
  [1, 2],
  [1, 3],
  [2, 4],
  [3, 4],
  [3, 5],
  [4, 6],
  [5, 6],
  [5, 7],
  [6, 7],
  [6, 8],
  [7, 8],
  [7, 9],
  [8, 10],
  [9, 10],
  [9, 11],
  [10, 12],
  [11, 12],
  [11, 13],
  [12, 14],
  [13, 14],
  [2, 7],
  [4, 9],
  [6, 11],
  [8, 13],
] as const

export function NetworkConstellation() {
  return (
    <div className={styles.frame} aria-hidden="true">
      <div className={styles.grid} />
      <svg viewBox="0 0 760 360" className={styles.svg}>
        <g className={styles.glow}>
          {links.map(([from, to], index) => (
            <path
              key={`${from}-${to}`}
              className={index % 5 === 0 ? styles.lineStrong : styles.line}
              d={`M ${points[from][0]} ${points[from][1]} Q ${(points[from][0] + points[to][0]) / 2} ${
                ((points[from][1] + points[to][1]) / 2) - 18
              } ${points[to][0]} ${points[to][1]}`}
            />
          ))}
          {points.map(([x, y], index) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={index % 4 === 0 ? 4.5 : 3.4}
              className={index % 3 === 0 ? styles.node : styles.nodeSoft}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
