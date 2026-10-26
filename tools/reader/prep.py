import re
FIX = [  # (regex, spoken)
 # --- Chapter 2 crypto terms (most-specific first) ---
 (r"\b3DES\b","triple D.E.S."), (r"\bHMAC-MD5\b","H-mac M.D. 5"), (r"\bHMAC-SHA-1\b","H-mac SHA 1"),
 (r"\bHMAC\b","H-mac"), (r"\bSHA-?512\b","SHA 512"), (r"\bSHA-?384\b","SHA 384"), (r"\bSHA-?256\b","SHA 256"),
 (r"\bSHA-?224\b","SHA 224"), (r"\bSHA-?3\b","SHA 3"), (r"\bSHA-?2\b","SHA 2"), (r"\bSHA-?1\b","SHA 1"), (r"\bSHA\b","SHA"),
 (r"\bBLAKE2\b","blake 2"), (r"\bCRYSTALS\b","crystals"), (r"\bECDSA\b","E.C.D.S.A."), (r"\bECDH\b","E.C.D.H."),
 (r"\bECC\b","E.C.C."), (r"\bDiffie-Hellman\b","Diffie Hellman"), (r"\bDH\b","D.H."), (r"\bIPsec\b","I.P. sec"),
 (r"\bIKE\b","I.K.E."), (r"\bESP\b","E.S.P."), (r"\bAH\b","A.H."), (r"\bGCM\b","G.C.M."), (r"\bPKCS\b","P.K.C.S."),
 (r"\bPKI\b","P.K.I."), (r"\bOCSP\b","O.C.S.P."), (r"\bSCEP\b","skep"), (r"\bCRLs\b","C.R.L.s"), (r"\bCRL\b","C.R.L."),
 (r"\bCAs\b","C.A.s"), (r"\bCA\b","C.A."), (r"\bX\.509v3\b","X 509 version 3"), (r"\bX\.509\b","X 509"),
 (r"\bX\.500\b","X 500"), (r"\b802\.1X\b","802 dot 1 X"), (r"\bAAA\b","triple A"), (r"\bFQDN\b","F.Q.D.N."),
 (r"\bLDAP\b","L-dap"), (r"\bPGP\b","P.G.P."), (r"\bNTP\b","N.T.P."), (r"\bPSKs\b","P.S.K.s"), (r"\bPSK\b","P.S.K."),
 (r"\bPCs\b","P.C.s"), (r"\bPC\b","P.C."), (r"\bCN\b","C.N."), (r"\bOU\b","O.U."), (r"\bIDEA\b","I.D.E.A."),
 (r"ISO/IEC", "I.S.O. I.E.C."), (r"ISO/PAS","I.S.O. PAS"), (r"ISO27k","I.S.O. 27 K"), (r"\bISO\b","I.S.O."),
 (r"\bSP 800\b","S.P. 800"), (r"\bSP 1800\b","S.P. 1800"), (r"\bSPs\b","S.P.s"), (r"\bSP\b","S.P."),
 (r"\bNISTIR\b","NIST I.R."), (r"\bISMS\b","I.S.M.S."), (r"US-CERT","U S cert"), (r"\bU\.S\.","U.S."),
 (r"CERT/SEI","CERT, S.E.I."), (r"CERT-In","CERT In"), (r"\bDoS/DDoS\b","D.O.S. and D.D.O.S."),
 (r"\bDDoS\b","D.D.O.S."), (r"\bDoS\b","D.O.S."), (r"\bDoD\b","D.O.D."), (r"DR/BCP","D.R. and B.C.P."),
 (r"HTTP/HTTPS","HTTP and HTTPS"), (r"\bIoT\b","I.O.T."), (r"\bIoCs\b","I.O.C.s"), (r"\bIaaS\b","I.A.A.S."),
 (r"\bPaaS\b","PAZ"), (r"\bSaaS\b","SASS"), (r"\bRaaS\b","ransomware as a service"), (r"\bIPv6\b","I.P. version 6"),
 (r"\bIPv4\b","I.P. version 4"), (r"\bret2libc\b","return to lib C"), (r"\bRet2Libc\b","return to lib C"),
 (r"\bROT13\b","rot 13"), (r"\bMD5\b","M.D. 5"), (r"\bRC4\b","R.C. 4"), (r"\bC2\b","C 2"), (r"\bA10\b","A 10"),
 (r"\bLRWPAN\b","L.R. W-PAN"), (r"\bLoRaWAN\b","LoRa WAN"), (r"\bOWASP\b","oh-wasp"), (r"\bSQL\b","sequel"),
 (r"\bSSVC\b","S.S.V.C."), (r"\bCVSS\b","C.V.S.S."), (r"\bInfoSec\b","info-sec"), (r"\bXSS\b","cross-site scripting"),
 (r"\bCSRF\b","C.S.R.F."), (r"\bSSRF\b","S.S.R.F."), (r"\bIDOR\b","I.D.O.R."), (r"\bSYN\b","sin"), (r"\bGUI\b","gooey"),
 (r"\bOAuth\b","oh-auth"), (r"\bWADL\b","waddle"), (r"\bWSDL\b","wiz-dull"), (r"\bSOAP\b","soap"), (r"\bREST\b","rest"),
 (r"\bRESTful\b","restful"), (r"\bJSON\b","jay-son"), (r"\bSTIX\b","sticks"), (r"\bTAXII\b","taxi"), (r"\bMITRE\b","my-ter"),
 (r"\bCISA\b","SIS-uh"), (r"\bFIPS\b","fips"), (r"\bCOBIT\b","co-bit"), (r"\bITIL\b","eye-till"), (r"\bCORBA\b","cor-ba"),
 (r"\bNATAS\b","nah-tahs"), (r"\bWEP\b","wep"), (r"\bMQTT\b","M.Q.T.T."), (r"\bCoAP\b","co-app"), (r"\bAMQP\b","A.M.Q.P."),
 (r"\bXMPP\b","X.M.P.P."), (r"\bDOM\b","dom"), (r"DOM-based","dom-based"), (r"\bOpenC2\b","Open C 2"), (r"\bOAS\b","O.A.S."),
 (r"\bCNAs\b","C.N.A.s"), (r"\bPSIRTs\b","P-certs"), (r"\bPSIRT\b","P-cert"), (r"\bCSIRTs\b","C-certs"), (r"\bCSIRT\b","C-cert"),
 (r"\bCERTs\b","certs"), (r"\bCERT\b","cert"), (r"\bAusCERT\b","Aus cert"), (r"\bRAM\b","ram"), (r"\bRSA\b","R.S.A."),
 (r"\bAES\b","A.E.S."), (r"\bDES\b","D.E.S."), (r"\bSLAs\b","S.L.A.s"), (r"\bACLs\b","A.C.L.s"), (r"\bVPNs\b","V.P.N.s"),
 (r"\bLANs\b","lans"), (r"\bAPIs\b","A.P.I.s"), (r"\bURLs\b","U.R.L.s"), (r"\bIPs\b","I.P.s"), (r"\bISPs\b","I.S.P.s"),
 (r"\bIDs\b","I.D.s"), (r"\bCERTs\b","certs"), (r"\bOS\b","O.S."), (r"\bIT\b","I.T."), (r"\bAI\b","A.I."), (r"\bML\b","M.L."),
 (r"\be\.g\.,?","for example,"), (r"\bi\.e\.,?","that is,"), (r"\bvs\.","versus"), (r"&"," and "), (r"→"," leads to "),
]
def speak(t):
    for a,b in FIX: t=re.sub(a,b,t)
    t=t.replace("/"," or ").replace("–",", ").replace("—",", ")
    t=re.sub(r"\.\.",".",t)
    return re.sub(r"\s+"," ",t).strip()
