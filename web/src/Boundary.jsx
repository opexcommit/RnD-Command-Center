import { Component } from 'react';

// The page must work without WebGL: any error in a 3D part renders nothing.
export default class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
