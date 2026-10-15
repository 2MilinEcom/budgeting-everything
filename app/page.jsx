import Dashboard from './Dashboard';
import audit from '../data/audit.json';
export default function Home(){return <><p style={{padding:"12px 24px",background:"#fff3cd",color:"#493b00"}}>Portfolio demo — all transactions shown here are fictional.</p><Dashboard audit={audit}/></>}
