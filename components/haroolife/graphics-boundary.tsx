'use client'

import { Component, type ReactNode } from 'react'

/** A graphics failure must never replace the account, controls or the whole FaîtiereHub page. */
export default class GraphicsBoundary extends Component<
  {
    children: ReactNode
    onUnavailable: () => void
  },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onUnavailable()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
